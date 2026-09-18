"""
Confirmation de commande par WhatsApp.

Deux niveaux, actives independamment via les variables d'environnement :

1. Lien wa.me (toujours disponible, aucune configuration requise) : un lien
   pre-rempli qui ouvre WhatsApp avec le message de confirmation. Fonctionne
   immediatement mais demande un clic (client ou vendeur) pour etre envoye.
   C'est la methode fournie par defaut sur le tableau de bord admin et la
   page de confirmation de commande.

2. Envoi automatique via l'API WhatsApp Cloud (Meta), si
   WHATSAPP_ACCESS_TOKEN et WHATSAPP_PHONE_NUMBER_ID sont renseignes. ATTENTION :
   Meta exige un compte WhatsApp Business verifie, et un message envoye a
   l'initiative de l'entreprise (hors fenetre de conversation client de 24h)
   doit utiliser un modele de message pre-approuve — un simple texte libre
   sera refuse par l'API en dehors de cette fenetre. Ce module tente l'envoi
   automatique quand il est configure, mais le lien wa.me reste generee dans
   tous les cas comme solution de repli fiable.

Dans les deux cas, l'envoi n'a lieu qu'apres appel a mark_order_paid() —
jamais avant confirmation reelle du paiement.
"""

from urllib.parse import quote

import requests
from django.conf import settings
from django.utils import timezone


def _normalize_phone(phone):
    return "".join(ch for ch in (phone or "") if ch.isdigit())


def build_confirmation_message(order):
    lines = [
        f"Bonjour {order.customer_name}, votre commande {order.reference} chez "
        "La Belle Teranga est confirmee !",
        "",
        "Articles :",
    ]
    for item in order.items.all():
        lines.append(f"- {item.product_name} x{item.quantity} : {int(item.subtotal)} FCFA")

    lines += [
        "",
        f"Total : {int(order.total_amount)} FCFA",
        f"Paiement : {order.get_payment_method_display()}",
        f"Adresse de livraison : {order.delivery_address or 'non renseignee'}",
    ]

    if order.location_maps_url:
        lines.append(f"Position du client : {order.location_maps_url}")

    lines += ["", "Merci de votre confiance - La Belle Teranga, l'art du service."]
    return "\n".join(lines)


def whatsapp_deep_link(phone_number, message):
    digits = _normalize_phone(phone_number)
    if not digits:
        return None
    return f"https://wa.me/{digits}?text={quote(message)}"


def send_order_confirmation(order):
    """
    A appeler uniquement une fois la commande marquee PAID (voir
    apps.orders.services.mark_order_paid). Renvoie les liens wa.me pret a
    l'emploi (client et boutique) et tente en plus l'envoi automatique si
    l'API WhatsApp Cloud est configuree.
    """
    message = build_confirmation_message(order)

    sent_automatically = False
    if settings.WHATSAPP_ACCESS_TOKEN and settings.WHATSAPP_PHONE_NUMBER_ID and order.customer_phone:
        sent_automatically = _send_via_cloud_api(order.customer_phone, message)

    order.whatsapp_confirmation_sent_at = timezone.now()
    order.save(update_fields=["whatsapp_confirmation_sent_at"])

    return {
        "message": message,
        "sent_automatically": sent_automatically,
        "customer_link": whatsapp_deep_link(order.customer_phone, message),
        "shop_link": whatsapp_deep_link(settings.WHATSAPP_SHOP_NUMBER, message),
    }


def _send_via_cloud_api(recipient_phone, message):
    url = f"https://graph.facebook.com/v20.0/{settings.WHATSAPP_PHONE_NUMBER_ID}/messages"
    headers = {"Authorization": f"Bearer {settings.WHATSAPP_ACCESS_TOKEN}"}
    payload = {
        "messaging_product": "whatsapp",
        "to": _normalize_phone(recipient_phone),
        "type": "text",
        "text": {"body": message},
    }
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        return response.status_code == 200
    except requests.RequestException:
        return False
