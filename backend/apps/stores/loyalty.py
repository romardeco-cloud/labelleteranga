import re
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from .models import LoyaltyMember, LoyaltyReward, get_settings


def normalize_phone(phone):
    """Chiffres seulement, sans l'indicatif 221 : '+221 77 123 45 67' -> '771234567'. Vide si trop court."""
    digits = re.sub(r"\D", "", phone or "")
    if digits.startswith("221") and len(digits) > 9:
        digits = digits[3:]
    return digits[-9:] if len(digits) >= 8 else ""


def reward_text(st):
    if st.loyalty_reward_label:
        return st.loyalty_reward_label
    value = int(st.loyalty_reward_value)
    if st.loyalty_reward_type == "percent":
        return f"Reduction de {value} %"
    if st.loyalty_reward_type == "amount":
        return f"Reduction de {value:,} FCFA".replace(",", " ")
    return "Cadeau offert"


def active_rewards(member):
    now = timezone.now()
    return [r for r in member.rewards.filter(used_at__isnull=True) if not r.expires_at or r.expires_at > now]


@transaction.atomic
def record_paid_order(order):
    """Comptabilise une commande payee dans le programme de fidelite du point de vente (si actif) et attribue les recompenses."""
    store = order.point_of_sale
    if not store:
        return []
    st = get_settings(store)
    phone = normalize_phone(order.customer_phone)
    if not st.loyalty_enabled or not phone:
        return []
    amount = Decimal(order.total_amount or 0) - Decimal(order.tip_amount or 0)
    if amount < st.loyalty_min_order or amount <= 0:
        return []
    member, _ = LoyaltyMember.objects.select_for_update().get_or_create(point_of_sale=store, phone=phone)
    if order.customer_name and not order.customer_name.lower().startswith(("client", "table")):
        member.name = order.customer_name
    member.orders_count += 1
    member.total_spent += amount
    member.progress += Decimal(1) if st.loyalty_mode == "orders" else amount
    threshold = Decimal(max(st.loyalty_threshold, 1))
    created = []
    while member.progress >= threshold:
        member.progress -= threshold
        member.rewards_earned += 1
        created.append(
            LoyaltyReward.objects.create(
                member=member,
                point_of_sale=store,
                reward_type=st.loyalty_reward_type,
                value=st.loyalty_reward_value,
                label=reward_text(st),
                expires_at=timezone.now() + timedelta(days=st.loyalty_valid_days) if st.loyalty_valid_days else None,
            )
        )
    member.save()
    return created


def member_status(store, phone):
    """Etat de fidelite d'un client (pour le site, la caisse et la page de confirmation)."""
    st = get_settings(store)
    out = {
        "enabled": st.loyalty_enabled,
        "mode": st.loyalty_mode,
        "threshold": st.loyalty_threshold,
        "reward_label": reward_text(st),
        "reward_type": st.loyalty_reward_type,
        "reward_value": int(st.loyalty_reward_value),
        "member": None,
    }
    key = normalize_phone(phone)
    if st.loyalty_enabled and key:
        member = LoyaltyMember.objects.filter(point_of_sale=store, phone=key).first()
        if member:
            out["member"] = {
                "name": member.name,
                "orders_count": member.orders_count,
                "progress": float(member.progress),
                "rewards": [
                    {"id": r.id, "code": r.code, "label": r.label, "expires_at": r.expires_at} for r in active_rewards(member)
                ],
            }
    return out


def apply_reward_to_order(order, subtotal):
    """Utilise la plus ancienne recompense disponible du client sur cette commande ; renvoie la remise appliquee."""
    key = normalize_phone(order.customer_phone)
    if not key or not order.point_of_sale:
        return Decimal(0)
    member = LoyaltyMember.objects.filter(point_of_sale=order.point_of_sale, phone=key).first()
    if not member:
        return Decimal(0)
    rewards = sorted(active_rewards(member), key=lambda r: r.created_at)
    if not rewards:
        return Decimal(0)
    reward = rewards[0]
    if reward.reward_type == "percent":
        discount = (subtotal * reward.value / Decimal(100)).quantize(Decimal(1))
    elif reward.reward_type == "amount":
        discount = min(Decimal(reward.value), subtotal)
    else:
        discount = Decimal(0)
    reward.used_at = timezone.now()
    reward.used_on_order = order.reference[:40]
    reward.save(update_fields=["used_at", "used_on_order"])
    order.discount_amount = discount
    order.reward_label = reward.label
    return discount
