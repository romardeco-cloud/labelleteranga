from django.urls import path

from .views import (
    CreateCashOrderView,
    CreateCheckoutSessionView,
    CreateOrangeMoneyCheckoutView,
    CreateWaveCheckoutView,
    MarkOrderPaidView,
    ResendWhatsAppView,
    orange_money_webhook,
    stripe_webhook,
    wave_webhook,
)

urlpatterns = [
    path("create-checkout-session/", CreateCheckoutSessionView.as_view()),
    path("webhook/", stripe_webhook),
    path("wave/create-checkout/", CreateWaveCheckoutView.as_view()),
    path("wave/webhook/", wave_webhook),
    path("orange-money/create-checkout/", CreateOrangeMoneyCheckoutView.as_view()),
    path("orange-money/webhook/", orange_money_webhook),
    path("cash-order/", CreateCashOrderView.as_view()),
    path("orders/<str:reference>/mark-paid/", MarkOrderPaidView.as_view()),
    path("orders/<str:reference>/resend-whatsapp/", ResendWhatsAppView.as_view()),
]
