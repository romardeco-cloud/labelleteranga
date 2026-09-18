"""
Integration Orange Money Web Payment (Orange Developer Center).

Documentation officielle : https://developer.orange.com/apis/om-webpay
A verifier/adapter selon la version la plus recente de l'API avant mise en
production (aucun compte marchand Orange Money reel n'a ete disponible pour
tester cette integration cote sandbox).

Flux :
1. Authentification OAuth2 (client_credentials) pour obtenir un access_token.
2. Initialisation du paiement web (webpayment), qui renvoie une payment_url
   vers laquelle on redirige le client.
3. Orange notifie notre webhook (notif_url) une fois le paiement effectue.
"""

import requests
from django.conf import settings

OM_OAUTH_URL = "https://api.orange.com/oauth/v3/token"
OM_WEBPAYMENT_URL = "https://api.orange.com/orange-money-webpay/dev/v1/webpayment"


def _get_access_token():
    response = requests.post(
        OM_OAUTH_URL,
        data={"grant_type": "client_credentials"},
        auth=(settings.ORANGE_MONEY_CLIENT_ID, settings.ORANGE_MONEY_CLIENT_SECRET),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=15,
    )
    response.raise_for_status()
    return response.json()["access_token"]


def create_web_payment(order):
    access_token = _get_access_token()
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    payload = {
        "merchant_key": settings.ORANGE_MONEY_MERCHANT_KEY,
        "currency": settings.ORANGE_MONEY_CURRENCY,
        "order_id": order.reference,
        "amount": int(order.total_amount),
        "return_url": f"{settings.FRONTEND_URL}/checkout/success?order={order.reference}",
        "cancel_url": f"{settings.FRONTEND_URL}/checkout/cancel?order={order.reference}",
        "notif_url": f"{settings.BACKEND_URL}/api/payments/orange-money/webhook/",
        "lang": "fr",
        "reference": "La Belle Teranga",
    }
    response = requests.post(OM_WEBPAYMENT_URL, json=payload, headers=headers, timeout=15)
    response.raise_for_status()
    return response.json()
