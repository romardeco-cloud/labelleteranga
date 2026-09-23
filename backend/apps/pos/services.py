from datetime import time as dt_time
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.catalog.models import Product
from apps.orders.models import Order, OrderItem
from apps.orders.services import parse_tip
from apps.reports.models import CashierOpening, DailyClosing
from apps.stores.models import Stock, StockMovement
from apps.stores.services import change_stock
from django.db.models.functions import TruncDate

POS_PAYMENT_METHODS = {m for m, _ in Order.PaymentMethod.choices}


@transaction.atomic
def create_pos_sale(cashier_profile, items, payment_method, customer_name="", amount_received=None, table_label="", customer_phone="", tip_amount=0):
    """
    Enregistre une vente en caisse : commande deja payee, rattachee au point de
    vente du caissier, et decremente le stock de CE point de vente. Tout ou rien :
    si un produit manque de stock, aucune vente n'est enregistree.
    """
    if payment_method not in POS_PAYMENT_METHODS:
        raise ValidationError({"payment_method": "Moyen de paiement invalide."})
    from apps.stores.models import get_settings  # import tardif (evite un cycle d'apps)

    if payment_method not in get_settings(cashier_profile.point_of_sale).payment_methods:
        raise ValidationError({"payment_method": "Ce moyen de paiement n'est pas active pour ce point de vente."})
    if not items:
        raise ValidationError({"items": "Le panier est vide."})

    store = cashier_profile.point_of_sale
    if DailyClosing.objects.filter(
        date=timezone.localdate(), point_of_sale=store, cashier=cashier_profile.user
    ).exists():
        raise ValidationError({"detail": "Votre caisse est fermee pour aujourd'hui."})
    if not CashierOpening.objects.filter(date=timezone.localdate(), point_of_sale=store, cashier=cashier_profile.user).exists():
        raise ValidationError({"detail": "Ouvrez votre caisse (fond de caisse) avant de commencer a vendre."})

    order = Order.objects.create(
        channel=Order.Channel.POS,
        cashier=cashier_profile.user,
        point_of_sale=store,
        customer_name=customer_name or (f"Table {table_label}" if table_label else "Client comptoir"),
        service_mode=Order.ServiceMode.DINE_IN if table_label else Order.ServiceMode.DIRECT,
        table_label=table_label[:40],
        customer_email="",
        customer_phone=str(customer_phone or "")[:30],
        tip_amount=parse_tip(tip_amount),
        payment_method=payment_method,
        status=Order.Status.PAID,
        paid_at=timezone.now(),
    )

    from apps.stores.models import tracks_stock  # import tardif (evite un cycle d'apps)

    from apps.stores.services import price_for, special_prices_map

    specials = special_prices_map(store)
    tracked = tracks_stock(store)
    merged = {}
    for line in items:
        pid = int(line["product"])
        qty = int(line["quantity"])
        if qty <= 0:
            raise ValidationError({"items": "Quantite invalide."})
        merged[pid] = merged.get(pid, 0) + qty

    for product_id, qty in merged.items():
        product = Product.objects.filter(pk=product_id, is_active=True).first()
        if not product:
            raise ValidationError({"items": f"Produit {product_id} introuvable ou inactif."})

        product_tracked = tracked and tracks_stock(store, product)
        if product_tracked:
            stock = Stock.objects.select_for_update().filter(product=product, point_of_sale=store).first()
            available = stock.quantity if stock else 0
            if available < qty:
                raise ValidationError({"items": f"Stock insuffisant pour '{product.name}' (disponible: {available})."})

        unit_price, _label = price_for(product, store, specials)

        OrderItem.objects.create(
            order=order,
            product=product,
            product_name=product.name,
            unit_price=unit_price,
            quantity=qty,
        )
        if product_tracked:
            change_stock(
                product,
                store,
                delta=-qty,
                reason=StockMovement.Reason.SALE_POS,
                reference=order.reference[:8].upper(),
                user=cashier_profile.user,
            )

    order.recompute_total()
    order.save(update_fields=["total_amount"])

    if order.customer_phone:
        from apps.stores.loyalty import record_paid_order

        record_paid_order(order)

    received = Decimal(str(amount_received)) if amount_received not in (None, "") else None
    if received is not None and received < order.total_amount and payment_method == Order.PaymentMethod.CASH:
        raise ValidationError({"amount_received": "Montant recu inferieur au total."})

    return order, received


def _unclosed_prior_dates(cashier_profile, before_date):
    """Jours strictement avant `before_date` ou ce caissier a vendu, sans fermeture enregistree (argent jamais retire du tiroir)."""
    store = cashier_profile.point_of_sale
    dates = (
        Order.objects.filter(
            status=Order.Status.PAID,
            channel=Order.Channel.POS,
            cashier=cashier_profile.user,
            point_of_sale=store,
            paid_at__date__lt=before_date,
        )
        .annotate(d=TruncDate("paid_at"))
        .order_by()  # sans ceci, le tri par defaut du modele (-created_at) empeche le DISTINCT de dedoublonner les dates
        .values_list("d", flat=True)
        .distinct()
    )
    dates = list(dates)
    if not dates:
        return []
    closed = set(
        DailyClosing.objects.filter(point_of_sale=store, cashier=cashier_profile.user, date__in=dates).values_list("date", flat=True)
    )
    return sorted(d for d in dates if d not in closed)


def cashier_expected_with_carryover(cashier_profile, for_date):
    """
    Attendu du jour + solde des jours precedents jamais fermes (le caissier ne compte qu'une seule fois l'argent
    accumule dans le tiroir). Retourne (attendu_total, attendu_du_jour, solde_reporte, jours_reportes, ventes_du_jour).
    """
    own, sales_count = cashier_sales_totals(cashier_profile, for_date)
    prior_dates = _unclosed_prior_dates(cashier_profile, for_date)
    carried = {k: Decimal("0") for k in own}
    for d in prior_dates:
        t, _ = cashier_sales_totals(cashier_profile, d)
        for k in carried:
            carried[k] += t[k]
    combined = {k: own[k] + carried[k] for k in own}
    return combined, own, carried, prior_dates, sales_count


def opening_cash_for(cashier_profile, for_date):
    """Fond de caisse (especes) ouvert ce jour-la par ce caissier, ou None si sa caisse n'a pas ete ouverte."""
    opening = CashierOpening.objects.filter(date=for_date, point_of_sale=cashier_profile.point_of_sale, cashier=cashier_profile.user).first()
    return opening.opening_cash if opening else None


@transaction.atomic
def open_cashier_day(cashier_profile, opening_cash, notes="", for_date=None, opened_by=None):
    """
    Ouverture de caisse : fond de caisse (especes) saisi manuellement avant de commencer les ventes du jour.
    Une seule ouverture par jour et par caissier (voir CashierOpening.Meta.unique_together) ; l'administrateur
    peut la corriger via cette meme fonction (create_or_update). Retourne (ouverture, creee).
    """
    today = for_date or timezone.localdate()
    try:
        amount = Decimal(str(opening_cash or 0))
    except Exception:
        raise ValidationError({"opening_cash": "Montant invalide."})
    if amount < 0:
        raise ValidationError({"opening_cash": "Le fond de caisse ne peut pas etre negatif."})

    opening, created = CashierOpening.objects.get_or_create(
        date=today,
        point_of_sale=cashier_profile.point_of_sale,
        cashier=cashier_profile.user,
        defaults={"opening_cash": amount, "notes": (notes or "")[:200], "opened_by": opened_by or cashier_profile.user},
    )
    if not created:
        opening.opening_cash = amount
        opening.notes = (notes or "")[:200]
        opening.opened_by = opened_by or opening.opened_by
        opening.save(update_fields=["opening_cash", "notes", "opened_by", "updated_at"])
    return opening, created


def cashier_sales_totals(cashier_profile, for_date):
    """Totaux attendus par moyen de paiement pour CE caissier, ce jour-la : ventes, + le fond de caisse en especes."""
    from django.db.models import Count, Sum

    totals = {key: Decimal("0") for key, _ in Order.PaymentMethod.choices}
    qs = Order.objects.filter(
        status=Order.Status.PAID,
        channel=Order.Channel.POS,
        cashier=cashier_profile.user,
        point_of_sale=cashier_profile.point_of_sale,
        paid_at__date=for_date,
    )
    for row in qs.values("payment_method").annotate(total=Sum("total_amount")):
        totals[row["payment_method"]] = row["total"] or Decimal("0")
    opening_cash = opening_cash_for(cashier_profile, for_date)
    if opening_cash:
        totals["cash"] += opening_cash  # le tiroir doit contenir le fond de caisse du matin + les ventes en especes
    return totals, qs.aggregate(n=Count("id"))["n"]


@transaction.atomic
def close_cashier_day(cashier_profile, declared, notes="", for_date=None, closed_by=None):
    """
    Fermeture de caisse du caissier. Un premier appel cree la fermeture (comptage a l'aveugle) ;
    les appels suivants, le meme jour, corrigent le comptage apres que le caissier a vu son ecart.
    L'ecart initial et le nombre de corrections restent enregistres pour l'administrateur.
    Retourne (fermeture, creee).
    """
    today = for_date or timezone.localdate()

    # jours anterieurs jamais fermes : leur argent est melange a celui d'aujourd'hui dans le tiroir, on les
    # cloture donc automatiquement a l'equilibre (le caissier ne les compte pas separement)
    combined_expected, _own_expected, carried, prior_dates, _ = cashier_expected_with_carryover(cashier_profile, today)
    for d in prior_dates:
        if DailyClosing.objects.filter(date=d, point_of_sale=cashier_profile.point_of_sale, cashier=cashier_profile.user).exists():
            continue
        t, _ = cashier_sales_totals(cashier_profile, d)
        DailyClosing.objects.create(
            date=d,
            point_of_sale=cashier_profile.point_of_sale,
            cashier=cashier_profile.user,
            closed_by=closed_by or cashier_profile.user,
            notes=f"Solde reporte : cloture avec la journee du {today.strftime('%d/%m/%Y')}.",
            expected_card=t["card"], expected_wave=t["wave"], expected_orange_money=t["orange_money"], expected_cash=t["cash"],
            declared_card=t["card"], declared_wave=t["wave"], declared_orange_money=t["orange_money"], declared_cash=t["cash"],
            auto_closed=True,
        )

    def amount(key):
        try:
            value = Decimal(str(declared.get(key, 0) or 0))
        except Exception:
            raise ValidationError({key: "Montant invalide."})
        if value < 0:
            raise ValidationError({key: "Montant invalide."})
        return value

    values = {
        "declared_card": amount("card"),
        "declared_wave": amount("wave"),
        "declared_orange_money": amount("orange_money"),
        "declared_cash": amount("cash"),
    }
    expected = {
        "expected_card": combined_expected["card"],
        "expected_wave": combined_expected["wave"],
        "expected_orange_money": combined_expected["orange_money"],
        "expected_cash": combined_expected["cash"],
    }
    covers_from = prior_dates[0] if prior_dates else None
    notes = (notes or "")[:1000]

    closing = DailyClosing.objects.select_for_update().filter(
        date=today, point_of_sale=cashier_profile.point_of_sale, cashier=cashier_profile.user
    ).first()

    if closing is None:
        closing = DailyClosing(
            date=today,
            point_of_sale=cashier_profile.point_of_sale,
            cashier=cashier_profile.user,
            closed_by=closed_by or cashier_profile.user,
            notes=notes,
            covers_from=covers_from,
            **values,
            **expected,
        )
        closing.initial_discrepancy_total = closing.discrepancy_total
        closing.save()
        return closing, True

    for field, value in {**values, **expected}.items():
        setattr(closing, field, value)
    if notes:
        closing.notes = notes
    closing.revision_count += 1
    closing.save()
    return closing, False


def auto_close_overdue_cashiers(only_profile=None, store=None):
    """
    Ferme automatiquement, a l'equilibre (sans ecart, personne n'a compte), la caisse de chaque caissier
    qui ne l'a pas fermee la veille avant 2h du matin (ou un jour plus ancien, toujours en retard). Appelee
    a chaque usage de la caisse/de l'admin (voir apps.pos.views et apps.reports.views) et, si configuree,
    par un appel programme externe (voir AUTO_CLOSE_SECRET). Retourne le nombre de journees fermees.
    """
    from datetime import timedelta

    from apps.accounts.models import CashierProfile

    now = timezone.localtime()
    today = now.date()
    yesterday = today - timedelta(days=1)
    yesterday_ready = now.time() >= dt_time(2, 0)  # avant 2h, on laisse encore la chance au caissier de fermer hier lui-meme

    profiles = CashierProfile.objects.filter(is_active=True).select_related("user", "point_of_sale")
    if only_profile is not None:
        profiles = profiles.filter(pk=only_profile.pk)
    if store is not None:
        profiles = profiles.filter(point_of_sale_id=store)

    closed = 0
    for profile in profiles:
        if not profile.point_of_sale_id:
            continue
        overdue = _unclosed_prior_dates(profile, today)
        for d in overdue:
            if d == yesterday and not yesterday_ready:
                continue
            totals, _ = cashier_sales_totals(profile, d)
            DailyClosing.objects.create(
                date=d,
                point_of_sale=profile.point_of_sale,
                cashier=profile.user,
                closed_by=None,
                notes="Fermeture automatique : caisse non fermee par le caissier avant 2h du matin.",
                expected_card=totals["card"], expected_wave=totals["wave"], expected_orange_money=totals["orange_money"], expected_cash=totals["cash"],
                declared_card=totals["card"], declared_wave=totals["wave"], declared_orange_money=totals["orange_money"], declared_cash=totals["cash"],
                auto_closed=True,
            )
            closed += 1
    return closed
