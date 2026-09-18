from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

import stripe

from apps.cart.models import Cart
from apps.orders.models import Order, OrderItem

stripe.api_key = settings.STRIPE_SECRET_KEY


class CreateCheckoutSessionView(APIView):
    """
    POST /api/payments/create-checkout-session/
    body: {session_key, customer_name, customer_email, customer_phone, delivery_address}

    Cree une Commande a partir du panier puis une session Stripe Checkout.
    """

    def post(self, request):
        data = request.data
        cart = get_object_or_404(Cart, session_key=data.get("session_key"))
        items = list(cart.items.select_related("product").all())

        if not items:
            return Response({"detail": "Le panier est vide."}, status=status.HTTP_400_BAD_REQUEST)

        order = Order.objects.create(
            customer_name=data.get("customer_name", ""),
            customer_email=data.get("customer_email", ""),
            customer_phone=data.get("customer_phone", ""),
            delivery_address=data.get("delivery_address", ""),
        )

        line_items = []
        for cart_item in items:
            OrderItem.objects.create(
                order=order,
                product=cart_item.product,
                product_name=cart_item.product.name,
                unit_price=cart_item.product.price,
                quantity=cart_item.quantity,
            )
            line_items.append(
                {
                    "price_data": {
                        "currency": settings.STRIPE_CURRENCY,
                        "product_data": {"name": cart_item.product.name},
                        # Stripe attend le plus petit montant (pas de decimales pour XOF)
                        "unit_amount": int(cart_item.product.price),
                    },
                    "quantity": cart_item.quantity,
                }
            )

        order.recompute_total()
        order.save()

        checkout_session = stripe.checkout.Session.create(
            mode="payment",
            line_items=line_items,
            success_url=f"{settings.FRONTEND_URL}/checkout/success?order={order.reference}",
            cancel_url=f"{settings.FRONTEND_URL}/checkout/cancel?order={order.reference}",
            customer_email=order.customer_email or None,
            metadata={"order_reference": order.reference},
        )

        order.stripe_checkout_session_id = checkout_session.id
        order.save(update_fields=["stripe_checkout_session_id"])

        # panier vide une fois la commande creee
        cart.items.all().delete()

        return Response(
            {"checkout_url": checkout_session.url, "order_reference": order.reference},
            status=status.HTTP_201_CREATED,
        )


@csrf_exempt
def stripe_webhook(request):
    payload = request.body
    sig_header = request.META.get("HTTP_STRIPE_SIGNATURE", "")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, settings.STRIPE_WEBHOOK_SECRET)
    except (ValueError, stripe.error.SignatureVerificationError):
        return JsonResponse({"detail": "invalid signature"}, status=400)

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        order_reference = session.get("metadata", {}).get("order_reference")
        if order_reference:
            Order.objects.filter(reference=order_reference).update(
                status=Order.Status.PAID,
                paid_at=timezone.now(),
                stripe_payment_intent_id=session.get("payment_intent", ""),
            )
    elif event["type"] in ("checkout.session.expired",):
        session = event["data"]["object"]
        order_reference = session.get("metadata", {}).get("order_reference")
        if order_reference:
            Order.objects.filter(reference=order_reference).update(status=Order.Status.FAILED)

    return JsonResponse({"received": True}, status=200)
