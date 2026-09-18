from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.catalog.models import Product
from apps.orders.models import Order, OrderItem
from apps.stores.models import Stock

POS_PAYMENT_METHODS = {m for m, _ in Order.PaymentMethod.choices}


@transaction.atomic
def create_pos_sale(cashier_profile, items, payment_method, customer_name="", amount_received=None):
    """
    Enregistre une vente en caisse : commande deja payee, rattachee au point de
    vente du caissier, et decremente le stock de CE point de vente. Tout ou rien :
    si un produit manque de stock, aucune vente n'est enregistree.
    """
    if payment_method not in POS_PAYMENT_METHODS:
        raise ValidationError({"payment_method": "Moyen de paiement invalide."})
    if not items:
        raise ValidationError({"items": "Le panier est vide."})

    store = cashier_profile.point_of_sale
    order = Order.objects.create(
        channel=Order.Channel.POS,
        cashier=cashier_profile.user,
        point_of_sale=store,
        customer_name=customer_name or "Client comptoir",
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
        stock.quantity -= qty
        stock.save(update_fields=["quantity", "updated_at"])

    order.recompute_total()
    order.save(update_fields=["total_amount"])

    received = Decimal(str(amount_received)) if amount_received not in (None, "") else None
    if received is not None and received < order.total_amount and payment_method == Order.PaymentMethod.CASH:
        raise ValidationError({"amount_received": "Montant recu inferieur au total."})

    return order, received
