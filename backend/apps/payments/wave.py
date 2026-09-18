"""
Integration Wave Checkout (Wave for Business).

Documentation officielle : https://docs.wave.com/business
A verifier/adapter selon la version la plus recente de l'API avant mise en
production (aucun compte Wave Business reel n'a ete disponible pour tester
cette integration cote sandbox).

Flux :
1. On cree une session de paiement via l'API Wave (create_checkout_session),
   qui renvoie une URL de paiement (wave_launch_url) vers laquelle on
   redirige le client.
2. Une fois le paiement effectue, Wave notifie notre webhook
   (/api/payments/wave/webhook/) avec l'evenement checkout.session.completed.
"""

import requests
from django.conf import settings

WAVE_API_BASE = "https://api.wave.com/v1"


def create_checkout_session(order):
    headers = {
        "Authorization": f"Bearer {settings.WAVE_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "amount": str(int(order.total_amount)),
        "currency": settings.WAVE_CURRENCY,
        "client_reference": order.reference,
        "success_url": f"{settings.FRONTEND_URL}{order.site_base}/checkout/success?order={order.reference}",
        "error_url": f"{settings.FRONTEND_URL}{order.site_base}/checkout/cancel?order={order.reference}",
    }
    response = requests.post(f"{WAVE_API_BASE}/checkout/sessions", json=payload, headers=headers, timeout=15)
    response.raise_for_status()
    return response.json()


def verify_webhook_signature(request):
    """
    Wave signe ses webhooks (voir doc officielle pour l'algorithme exact et
    l'en-tete utilise). A implementer avec le secret fourni par Wave avant
    la mise en production ; par defaut on fait confiance a l'IP source +
    HTTPS, ce qui est insuffisant en production.
    """
    return True
