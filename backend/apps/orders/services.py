from django.shortcuts import get_object_or_404
from django.utils import timezone

from apps.cart.models import Cart

from .models import Order, OrderItem


def parse_tip(raw):
    """Pourboire libre saisi par le client (FCFA entiers, positif, plafonne)."""
    from decimal import Decimal, InvalidOperation

    try:
        value = Decimal(str(raw or 0)).quantize(Decimal(1))
    except (InvalidOperation, ValueError):
        return Decimal(0)
    return min(max(value, Decimal(0)), Decimal(1000000))


def create_order_from_cart(session_key, customer_data, payment_method, clear_cart=True):
    """
    Cree une Commande (statut PENDING) a partir du panier de la session,
    copie les lignes du panier en OrderItem, puis vide le panier.
    Utilise par les 4 methodes de paiement (Stripe, Wave, Orange Money, Cash).
    """
    cart = get_object_or_404(Cart, session_key=session_key)
    items = list(cart.items.select_related("product").all())
    if not items:
        return None

    fulfillment = customer_data.get("fulfillment")
    if fulfillment not in (Order.Fulfillment.DELIVERY, Order.Fulfillment.PICKUP):
        fulfillment = Order.Fulfillment.DELIVERY

    order = Order.objects.create(
        point_of_sale=cart.point_of_sale,
        fulfillment=fulfillment,
        customer_name=customer_data.get("customer_name") or "",
        customer_email=(customer_data.get("customer_email") or "").strip(),  # facultatif
        customer_phone=customer_data.get("customer_phone") or "",
        delivery_address=customer_data.get("delivery_address", ""),
        delivery_latitude=customer_data.get("delivery_latitude") or None,
        delivery_longitude=customer_data.get("delivery_longitude") or None,
        payment_method=payment_method,
    )

    from apps.stores.services import price_for, special_prices_map

    specials = special_prices_map(cart.point_of_sale)
    for cart_item in items:
        OrderItem.objects.create(
            order=order,
            product=cart_item.product,
            product_name=cart_item.product.name,
            unit_price=price_for(cart_item.product, cart.point_of_sale, specials)[0],
            quantity=cart_item.quantity,
        )

    order.tip_amount = parse_tip(customer_data.get("tip_amount"))

    if str(customer_data.get("use_reward", "")).lower() in ("1", "true", "yes", "on"):
        from apps.stores.loyalty import apply_reward_to_order

        apply_reward_to_order(order, sum(i.subtotal for i in order.items.all()))

    order.recompute_total()
    order.save()

    if clear_cart:
        cart.items.all().delete()
    return order


def clear_cart(session_key):
    """Vide le panier d'une session (apres creation reussie du paiement en ligne)."""
    cart = Cart.objects.filter(session_key=session_key).first()
    if cart:
        cart.items.all().delete()


def mark_order_paid(order, **extra_fields):
    """
    Point d'entree UNIQUE pour confirmer le paiement d'une commande, quelle
    que soit la methode (webhook Stripe/Wave/Orange Money, ou action admin
    pour un paiement especes a la livraison). Le message WhatsApp de
    confirmation n'est envoye qu'a partir d'ici, donc uniquement une fois
    le paiement reellement confirme.
    """
    if order.status == Order.Status.PAID:
        return order

    for field, value in extra_fields.items():
        setattr(order, field, value)

    order.status = Order.Status.PAID
    order.paid_at = timezone.now()
    order.save()

    _decrement_store_stock(order)

    from apps.stores.loyalty import record_paid_order

    try:
        record_paid_order(order)
    except Exception:  # la fidelite ne doit jamais bloquer une confirmation de paiement
        pass

    from apps.notifications.whatsapp import send_order_confirmation

    send_order_confirmation(order)

    return order


def _decrement_store_stock(order):
    """Sortie de stock du point de vente d'une commande en ligne (jamais bloquante : la commande est deja payee)."""
    if order.channel != Order.Channel.ONLINE or not order.point_of_sale_id:
        return
    from apps.stores.models import tracks_stock

    if not tracks_stock(order.point_of_sale):
        return
    from rest_framework.exceptions import ValidationError

    from apps.stores.models import StockMovement
    from apps.stores.services import change_stock

    for item in order.items.select_related("product"):
        if not item.product_id or not tracks_stock(order.point_of_sale, item.product):
            continue
        kwargs = dict(reason=StockMovement.Reason.ONLINE_ORDER, reference=order.reference[:8].upper())
        try:
            change_stock(item.product, order.point_of_sale, delta=-item.quantity, **kwargs)
        except ValidationError:  # stock insuffisant : on met a zero plutot que de refuser une commande payee
            change_stock(item.product, order.point_of_sale, set_to=0, **kwargs)


def change_order_payment_method(order, user, new_method, reason):
    """
    Corrige le mode de paiement d'une vente deja payee (erreur de saisie a la caisse ou en ligne).
    Refuse si la journee de caisse de cette vente est deja cloturee : la fermeture est un instantane fige
    (DailyClosing.expected_*), la corriger apres coup fausserait silencieusement une comptabilite deja
    enregistree. Dans ce cas, annuler la vente puis la resaisir est la seule option sure.
    """
    from django.db import transaction
    from rest_framework.exceptions import ValidationError

    if order.status != Order.Status.PAID:
        raise ValidationError({"detail": "Seule une vente payee peut avoir son mode de paiement corrige."})
    if order.channel == Order.Channel.POS and order.cashier_id and order.point_of_sale_id and order.paid_at:
        from apps.reports.models import DailyClosing

        if DailyClosing.objects.filter(date=order.paid_at.date(), point_of_sale_id=order.point_of_sale_id, cashier_id=order.cashier_id).exists():
            raise ValidationError(
                {"detail": "La journee de cette vente est deja cloturee : impossible de corriger le mode de paiement sans fausser la comptabilite. Annulez la vente et resaisissez-la."}
            )

    with transaction.atomic():
        order = Order.objects.select_for_update().get(pk=order.pk)
        old_method = order.payment_method
        if new_method == old_method:
            return order
        order.payment_method = new_method
        order.payment_method_changed_at = timezone.now()
        order.payment_method_changed_by = user
        order.payment_method_change_reason = f"{old_method} -> {new_method} : {reason}"[:200]
        order.save(update_fields=["payment_method", "payment_method_changed_at", "payment_method_changed_by", "payment_method_change_reason"])
    return order


def request_correction(order, user, action, reason, new_payment_method=None):
    """
    Demande d'un caissier (code secondaire, depuis la caisse) : annulation ou correction de paiement d'une de
    SES PROPRES ventes du jour. N'a AUCUN effet sur la vente : elle reste en attente jusqu'a ce que
    l'administrateur la confirme (code principal) ou la rejette, a n'importe quel moment.
    """
    from rest_framework.exceptions import ValidationError

    if order.status != Order.Status.PAID:
        raise ValidationError({"detail": "Seule une vente payee peut faire l'objet d'une demande."})
    if order.pending_action:
        raise ValidationError({"detail": "Une demande est deja en attente de confirmation pour cette vente."})
    if action == Order.PendingAction.CHANGE_PAYMENT:
        if new_payment_method not in {k for k, _ in Order.PaymentMethod.choices}:
            raise ValidationError({"payment_method": "Mode de paiement invalide."})
        if new_payment_method == order.payment_method:
            raise ValidationError({"payment_method": "Ce mode de paiement est deja celui de la vente."})

    order.pending_action = action
    order.pending_payment_method = new_payment_method or ""
    order.pending_reason = (reason or "")[:200]
    order.pending_requested_by = user
    order.pending_requested_at = timezone.now()
    order.save(update_fields=["pending_action", "pending_payment_method", "pending_reason", "pending_requested_by", "pending_requested_at"])
    return order


def _clear_pending(order):
    order.pending_action = ""
    order.pending_payment_method = ""
    order.pending_reason = ""
    order.pending_requested_by = None
    order.pending_requested_at = None
    order.save(update_fields=["pending_action", "pending_payment_method", "pending_reason", "pending_requested_by", "pending_requested_at"])


def confirm_correction(order, admin_user):
    """Applique (code principal) la demande en attente d'un caissier : annulation ou correction de paiement."""
    from rest_framework.exceptions import ValidationError

    if not order.pending_action:
        raise ValidationError({"detail": "Aucune demande en attente pour cette vente."})
    who = order.pending_requested_by.username if order.pending_requested_by_id else "un caissier"
    reason = f"{order.pending_reason} (demande par {who}, confirmee par {admin_user.username})"[:200]
    if order.pending_action == Order.PendingAction.VOID:
        order = void_order(order, admin_user, reason)
    else:
        order = change_order_payment_method(order, admin_user, order.pending_payment_method, reason)
    _clear_pending(order)
    return order


def reject_correction(order, admin_user):
    """Rejette (code principal), sans aucun effet sur la vente, la demande en attente d'un caissier."""
    from rest_framework.exceptions import ValidationError

    if not order.pending_action:
        raise ValidationError({"detail": "Aucune demande en attente pour cette vente."})
    _clear_pending(order)
    return order


def void_order(order, user, reason):
    """
    Annule (supprime des ventes) une commande : statut ANNULEE, motif et auteur conserves pour le controle, stock
    remis en rayon si la vente l'avait deja decremente. Les rapports ne comptent que les commandes payees.
    """
    from django.db import transaction
    from rest_framework.exceptions import ValidationError

    with transaction.atomic():
        order = Order.objects.select_for_update().get(pk=order.pk)
        if order.status == Order.Status.CANCELLED:
            raise ValidationError({"detail": "Cette vente est deja annulee."})
        was_paid = order.status == Order.Status.PAID
        from apps.stores.models import tracks_stock

        if was_paid and order.point_of_sale_id and tracks_stock(order.point_of_sale):
            from apps.stores.models import StockMovement
            from apps.stores.services import change_stock

            for item in order.items.select_related("product"):
                if item.product_id and tracks_stock(order.point_of_sale, item.product):
                    change_stock(
                        item.product,
                        order.point_of_sale,
                        delta=item.quantity,
                        reason=StockMovement.Reason.SALE_VOID,
                        reference=order.reference[:8].upper(),
                        user=user,
                    )
        order.status = Order.Status.CANCELLED
        order.voided_at = timezone.now()
        order.voided_by = user
        order.void_reason = (reason or "")[:200]
        order.save(update_fields=["status", "voided_at", "voided_by", "void_reason"])
    return order
