from django.shortcuts import get_object_or_404
from django.utils import timezone

from apps.cart.models import Cart

from .models import Order, OrderItem


def create_order_from_cart(session_key, customer_data, payment_method):
    """
    Cree une Commande (statut PENDING) a partir du panier de la session,
    copie les lignes du panier en OrderItem, puis vide le panier.
    Utilise par les 4 methodes de paiement (Stripe, Wave, Orange Money, Cash).
    """
    cart = get_object_or_404(Cart, session_key=session_key)
    items = list(cart.items.select_related("product").all())
    if not items:
        return None

    order = Order.objects.create(
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

    cart.items.all().delete()
    return order


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

    from apps.notifications.whatsapp import send_order_confirmation

    send_order_confirmation(order)

    return order
