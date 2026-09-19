from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView
from django.views.decorators.csrf import csrf_exempt

import stripe

from apps.orders.models import Order
from apps.orders.serializers import OrderSerializer
from apps.orders.services import clear_cart, create_order_from_cart, mark_order_paid

from . import orange_money, wave

stripe.api_key = settings.STRIPE_SECRET_KEY


class CreateCheckoutSessionView(APIView):
    """
    POST /api/payments/create-checkout-session/
    body: {session_key, customer_name, customer_email, customer_phone,
           delivery_address, delivery_latitude, delivery_longitude}

    Cree une Commande a partir du panier puis une session Stripe Checkout
    (paiement par carte bancaire).
    """

    def post(self, request):
        order = create_order_from_cart(
            request.data.get("session_key"), request.data, Order.PaymentMethod.CARD, clear_cart=False
        )
        if order is None:
            return Response({"detail": "Le panier est vide."}, status=status.HTTP_400_BAD_REQUEST)

        line_items = [
            {
                "price_data": {
                    "currency": settings.STRIPE_CURRENCY,
                    "product_data": {"name": item.product_name},
                    "unit_amount": int(item.unit_price),
                },
                "quantity": item.quantity,
            }
            for item in order.items.all()
        ]

        try:
            checkout_session = stripe.checkout.Session.create(
                mode="payment",
                line_items=line_items,
                success_url=f"{settings.FRONTEND_URL}{order.site_base}/checkout/success?order={order.reference}",
                cancel_url=f"{settings.FRONTEND_URL}{order.site_base}/checkout/cancel?order={order.reference}",
                customer_email=order.customer_email or None,
                metadata={"order_reference": order.reference},
            )
        except Exception:
            order.status = Order.Status.FAILED
            order.save(update_fields=["status"])
            return Response(
                {"detail": "Le paiement par carte n'est pas disponible pour le moment. Choisissez un autre moyen de paiement."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        order.stripe_checkout_session_id = checkout_session.id
        order.save(update_fields=["stripe_checkout_session_id"])
        clear_cart(request.data.get("session_key"))

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
        order = Order.objects.filter(reference=order_reference).first()
        if order:
            mark_order_paid(order, stripe_payment_intent_id=session.get("payment_intent", ""))
    elif event["type"] == "checkout.session.expired":
        session = event["data"]["object"]
        order_reference = session.get("metadata", {}).get("order_reference")
        Order.objects.filter(reference=order_reference).update(status=Order.Status.FAILED)

    return JsonResponse({"received": True}, status=200)


class CreateWaveCheckoutView(APIView):
    """
    POST /api/payments/wave/create-checkout/
    Meme body que Stripe. Cree la commande puis une session Wave Checkout.
    """

    def post(self, request):
        order = create_order_from_cart(
            request.data.get("session_key"), request.data, Order.PaymentMethod.WAVE, clear_cart=False
        )
        if order is None:
            return Response({"detail": "Le panier est vide."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            session = wave.create_checkout_session(order)
        except Exception:
            order.status = Order.Status.FAILED
            order.save(update_fields=["status"])
            return Response(
                {"detail": "Impossible de contacter Wave pour le moment. Reessayez ou choisissez un autre moyen de paiement."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        order.wave_checkout_id = session.get("id", "")
        order.save(update_fields=["wave_checkout_id"])
        clear_cart(request.data.get("session_key"))

        return Response(
            {"checkout_url": session.get("wave_launch_url"), "order_reference": order.reference},
            status=status.HTTP_201_CREATED,
        )


@csrf_exempt
def wave_webhook(request):
    import json

    if not wave.verify_webhook_signature(request):
        return JsonResponse({"detail": "invalid signature"}, status=400)

    try:
        event = json.loads(request.body)
    except ValueError:
        return JsonResponse({"detail": "invalid payload"}, status=400)

    if event.get("type") == "checkout.session.completed":
        session_data = event.get("data", {})
        order_reference = session_data.get("client_reference")
        order = Order.objects.filter(reference=order_reference).first()
        if order:
            mark_order_paid(order)

    return JsonResponse({"received": True}, status=200)


class CreateOrangeMoneyCheckoutView(APIView):
    """
    POST /api/payments/orange-money/create-checkout/
    Meme body que Stripe. Cree la commande puis initialise un paiement web
    Orange Money.
    """

    def post(self, request):
        order = create_order_from_cart(
            request.data.get("session_key"), request.data, Order.PaymentMethod.ORANGE_MONEY, clear_cart=False
        )
        if order is None:
            return Response({"detail": "Le panier est vide."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            payment = orange_money.create_web_payment(order)
        except Exception:
            order.status = Order.Status.FAILED
            order.save(update_fields=["status"])
            return Response(
                {
                    "detail": "Impossible de contacter Orange Money pour le moment. "
                    "Reessayez ou choisissez un autre moyen de paiement."
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

        order.orange_money_order_id = payment.get("pay_token", "")
        order.save(update_fields=["orange_money_order_id"])
        clear_cart(request.data.get("session_key"))

        return Response(
            {"checkout_url": payment.get("payment_url"), "order_reference": order.reference},
            status=status.HTTP_201_CREATED,
        )


@csrf_exempt
def orange_money_webhook(request):
    import json

    try:
        payload = json.loads(request.body)
    except ValueError:
        return JsonResponse({"detail": "invalid payload"}, status=400)

    if payload.get("status") == "SUCCESS":
        order_reference = payload.get("order_id")
        order = Order.objects.filter(reference=order_reference).first()
        if order:
            mark_order_paid(order)

    return JsonResponse({"received": True}, status=200)


class CreateCashOrderView(APIView):
    """
    POST /api/payments/cash-order/
    Cree une commande "paiement a la livraison" : aucun paiement en ligne,
    la commande reste PENDING jusqu'a ce qu'un admin la marque payee
    (voir MarkOrderPaidView) au moment de la livraison.
    """

    def post(self, request):
        order = create_order_from_cart(request.data.get("session_key"), request.data, Order.PaymentMethod.CASH)
        if order is None:
            return Response({"detail": "Le panier est vide."}, status=status.HTTP_400_BAD_REQUEST)

        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)


class CreateManualOrderView(APIView):
    """
    POST /api/payments/manual-order/  body: {payment_method: wave | orange_money, session_key, ...client}
    Paiement Wave / Orange Money par QR code (sans API marchand) : la commande reste en attente jusqu'a ce que
    l'equipe confirme la reception du paiement (Admin > Commandes > Marquer payee), ce qui envoie la
    confirmation WhatsApp.
    """

    def post(self, request):
        method = request.data.get("payment_method")
        if method not in (Order.PaymentMethod.WAVE, Order.PaymentMethod.ORANGE_MONEY):
            return Response({"detail": "Moyen de paiement invalide."}, status=status.HTTP_400_BAD_REQUEST)
        api_configured = settings.WAVE_API_KEY if method == Order.PaymentMethod.WAVE else settings.ORANGE_MONEY_CLIENT_ID
        if api_configured:
            return Response(
                {"detail": "Utilisez le paiement en ligne pour ce moyen de paiement."}, status=status.HTTP_400_BAD_REQUEST
            )
        order = create_order_from_cart(request.data.get("session_key"), request.data, method)
        if order is None:
            return Response({"detail": "Le panier est vide."}, status=status.HTTP_400_BAD_REQUEST)
        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)


class DeclarePaymentView(APIView):
    """
    POST /api/payments/orders/<reference>/declare-payment/  body: {payment_reference}
    Le client valide son paiement Wave / Orange Money par QR en donnant la reference de sa transaction. La commande
    est alors signalee "paiement declare" a l'equipe, qui la verifie avant de la confirmer (confirmation WhatsApp).
    """

    def post(self, request, reference):
        from django.utils import timezone

        order = get_object_or_404(Order, reference=reference)
        if order.status != Order.Status.PENDING or order.payment_method not in (
            Order.PaymentMethod.WAVE,
            Order.PaymentMethod.ORANGE_MONEY,
        ):
            return Response({"detail": "Cette commande n'attend pas de paiement."}, status=status.HTTP_400_BAD_REQUEST)
        ref = str(request.data.get("payment_reference") or "").strip()
        if len(ref) < 4:
            return Response(
                {"detail": "Indiquez la reference de votre transaction (au moins 4 caracteres)."}, status=status.HTTP_400_BAD_REQUEST
            )
        order.payment_reference = ref[:60]
        order.payment_declared_at = timezone.now()
        order.save(update_fields=["payment_reference", "payment_declared_at"])
        return Response(OrderSerializer(order).data)


class ResendWhatsAppView(APIView):
    """POST /api/payments/orders/<reference>/resend-whatsapp/ : renvoie la confirmation WhatsApp d'une commande payee."""

    permission_classes = [IsAdminUser]

    def post(self, request, reference):
        from apps.notifications.whatsapp import send_order_confirmation

        order = get_object_or_404(Order, reference=reference)
        if order.status != Order.Status.PAID:
            return Response({"detail": "La commande n'est pas payee."}, status=status.HTTP_400_BAD_REQUEST)
        send_order_confirmation(order)
        return Response(OrderSerializer(order).data)


class MarkOrderPaidView(APIView):
    """
    POST /api/payments/orders/<reference>/mark-paid/
    Reserve a l'admin : confirme manuellement le paiement d'une commande
    especes (a la livraison), ce qui declenche l'envoi de la confirmation
    WhatsApp comme pour les autres moyens de paiement.
    """

    permission_classes = [IsAdminUser]

    def post(self, request, reference):
        order = get_object_or_404(Order, reference=reference)
        order = mark_order_paid(order)
        return Response(OrderSerializer(order).data)
