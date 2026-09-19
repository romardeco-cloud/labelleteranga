from django.shortcuts import get_object_or_404
from django.utils import timezone

from apps.cart.models import Cart

from .models import Order, OrderItem


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
        customer_name=customer_data.get("customer_name", ""),
        customer_email=customer_data.get("customer_email", ""),
        customer_phone=customer_data.get("customer_phone", ""),
        delivery_address=customer_data.get("delivery_address", ""),
        delivery_latitude=customer_data.get("delivery_latitude") or None,
        delivery_longitude=customer_data.get("delivery_longitude") or None,
        payment_method=payment_method,
    )

    for cart_item in items:
        OrderItem.objects.create(
            order=order,
            product=cart_item.product,
            product_name=cart_item.product.name,
            unit_price=cart_item.product.price,
            quantity=cart_item.quantity,
        )

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
        if not item.product_id:
            continue
        kwargs = dict(reason=StockMovement.Reason.ONLINE_ORDER, reference=order.reference[:8].upper())
        try:
            change_stock(item.product, order.point_of_sale, delta=-item.quantity, **kwargs)
        except ValidationError:  # stock insuffisant : on met a zero plutot que de refuser une commande payee
            change_stock(item.product, order.point_of_sale, set_to=0, **kwargs)


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
                if item.product_id:
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
