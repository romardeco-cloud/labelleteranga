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
    Verifie l'en-tete Wave-Signature ("t=<epoch>,v1=<hmac>[,v1=<hmac2>...]") : HMAC-SHA256 de
    "<timestamp><corps brut de la requete>" avec WAVE_WEBHOOK_SECRET (visible UNE SEULE FOIS a la creation
    du webhook dans le Wave Business Portal). Sans cette verification, n'importe qui connaissant la reference
    d'une commande (visible du client dans l'URL de retour) peut appeler ce webhook lui-meme et se faire
    confirmer un paiement jamais effectue.

    Refuse si WAVE_WEBHOOK_SECRET n'est pas configure : mieux vaut un webhook qui ne confirme aucun paiement
    qu'un webhook qui les confirme tous sans verification.
    """
    import hashlib
    import hmac
    import time

    secret = settings.WAVE_WEBHOOK_SECRET
    if not secret:
        return False

    header = request.META.get("HTTP_WAVE_SIGNATURE", "")
    fields = [p.split("=", 1) for p in header.split(",") if "=" in p]
    timestamp = next((v for k, v in fields if k == "t"), None)
    signatures = [v for k, v in fields if k == "v1"]
    if not timestamp or not signatures:
        return False

    try:
        if abs(time.time() - int(timestamp)) > 5 * 60:  # rejette un webhook rejoue plus de 5 min apres coup
            return False
    except ValueError:
        return False

    expected = hmac.new(secret.encode(), (timestamp + request.body.decode("utf-8", "replace")).encode(), hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(expected, sig) for sig in signatures)
