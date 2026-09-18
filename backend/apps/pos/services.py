from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.catalog.models import Product
from apps.orders.models import Order, OrderItem
from apps.reports.models import DailyClosing
from apps.stores.models import Stock, StockMovement
from apps.stores.services import change_stock

POS_PAYMENT_METHODS = {m for m, _ in Order.PaymentMethod.choices}


@transaction.atomic
def create_pos_sale(cashier_profile, items, payment_method, customer_name="", amount_received=None, table_label=""):
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

    order = Order.objects.create(
        channel=Order.Channel.POS,
        cashier=cashier_profile.user,
        point_of_sale=store,
        customer_name=customer_name or (f"Table {table_label}" if table_label else "Client comptoir"),
        service_mode=Order.ServiceMode.DINE_IN if table_label else Order.ServiceMode.DIRECT,
        table_label=table_label[:40],
        customer_email="",
        payment_method=payment_method,
        status=Order.Status.PAID,
        paid_at=timezone.now(),
    )

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

        stock = Stock.objects.select_for_update().filter(product=product, point_of_sale=store).first()
        available = stock.quantity if stock else 0
        if available < qty:
            raise ValidationError({"items": f"Stock insuffisant pour '{product.name}' (disponible: {available})."})

        promo = product.active_promotion(store)
        unit_price = promo.discounted_price(product.price) if promo else product.price

        OrderItem.objects.create(
            order=order,
            product=product,
            product_name=product.name,
            unit_price=unit_price,
            quantity=qty,
        )
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

    received = Decimal(str(amount_received)) if amount_received not in (None, "") else None
    if received is not None and received < order.total_amount and payment_method == Order.PaymentMethod.CASH:
        raise ValidationError({"amount_received": "Montant recu inferieur au total."})

    return order, received


def cashier_sales_totals(cashier_profile, for_date):
    """Totaux attendus par moyen de paiement pour les ventes de CE caissier, ce jour-la."""
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
    totals, _ = cashier_sales_totals(cashier_profile, today)
    expected = {
        "expected_card": totals["card"],
        "expected_wave": totals["wave"],
        "expected_orange_money": totals["orange_money"],
        "expected_cash": totals["cash"],
    }
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
