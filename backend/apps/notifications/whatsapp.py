"""
Confirmation de commande par WhatsApp, via l'API WhatsApp Cloud de Meta.

Configuration (variables d'environnement) :
  WHATSAPP_ACCESS_TOKEN     - token d'acces permanent (System User) de votre
                              app WhatsApp Business Platform
  WHATSAPP_PHONE_NUMBER_ID  - identifiant du numero expediteur (Meta Business
                              Manager > WhatsApp > API Setup)
  WHATSAPP_TEMPLATE_NAME    - nom du modele de message approuve par Meta
                              (recommande, voir ci-dessous)
  WHATSAPP_TEMPLATE_LANGUAGE - code langue du modele (defaut "fr")
  WHATSAPP_SHOP_NUMBER      - numero de la boutique, utilise pour le lien
                              wa.me de secours

Pourquoi un modele (template) plutot qu'un texte libre :
Meta interdit l'envoi d'un message texte libre a l'initiative de
l'entreprise en dehors d'une fenetre de conversation client de 24h (le
client doit avoir ecrit en premier). Une commande passee sur le site web
n'ouvre pas cette fenetre, donc un texte libre sera refuse par l'API la
plupart du temps (erreur 131047). Il faut donc creer et faire approuver un
modele dans Meta Business Manager (WhatsApp Manager > Modeles de message),
avec exactement ce corps de texte (5 variables) :

  "Bonjour {{1}}, votre commande {{2}} chez La Belle Teranga est confirmee.
   Total : {{3}} FCFA. Paiement : {{4}}. Livraison : {{5}}. Merci de votre
   confiance - La Belle Teranga, l'art du service."

Une fois approuve (delai Meta habituel: quelques minutes a 24h), renseignez
son nom exact dans WHATSAPP_TEMPLATE_NAME.

Sans WHATSAPP_TEMPLATE_NAME configure, ce module retombe sur un envoi en
texte libre (ne fonctionnera que si le client a initie la conversation dans
les 24h, donc pas fiable pour une confirmation automatique) - et, dans tous
les cas, un lien wa.me pret a l'emploi est toujours genere en secours.

L'envoi n'a lieu qu'apres appel a mark_order_paid() — jamais avant
confirmation reelle du paiement.
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


def _template_parameters(order):
    """Doit correspondre exactement aux 5 variables {{1}}..{{5}} du modele approuve (voir docstring)."""
    return [
        order.customer_name or "client",
        order.reference[:8],
        f"{int(order.total_amount)}",
        order.get_payment_method_display(),
        order.delivery_address or "a confirmer",
    ]


def whatsapp_deep_link(phone_number, message):
    digits = _normalize_phone(phone_number)
    if not digits:
        return None
    return f"https://wa.me/{digits}?text={quote(message)}"


def send_order_confirmation(order):
    """
    A appeler uniquement une fois la commande marquee PAID (voir
    apps.orders.services.mark_order_paid). Tente l'envoi automatique via
    l'API WhatsApp Cloud si elle est configuree, et renvoie dans tous les
    cas les liens wa.me prets a l'emploi (client et boutique) en secours.
    """
    message = build_confirmation_message(order)

    sent_automatically = False
    if settings.WHATSAPP_ACCESS_TOKEN and settings.WHATSAPP_PHONE_NUMBER_ID and order.customer_phone:
        sent_automatically = _send_via_cloud_api(order)

    order.whatsapp_confirmation_sent_at = timezone.now()
    order.save(update_fields=["whatsapp_confirmation_sent_at"])

    return {
        "message": message,
        "sent_automatically": sent_automatically,
        "customer_link": whatsapp_deep_link(order.customer_phone, message),
        "shop_link": whatsapp_deep_link(settings.WHATSAPP_SHOP_NUMBER, message),
    }


def _send_via_cloud_api(order):
    url = (
        f"https://graph.facebook.com/{settings.WHATSAPP_API_VERSION}/"
        f"{settings.WHATSAPP_PHONE_NUMBER_ID}/messages"
    )
    headers = {"Authorization": f"Bearer {settings.WHATSAPP_ACCESS_TOKEN}"}
    recipient = _normalize_phone(order.customer_phone)

    if settings.WHATSAPP_TEMPLATE_NAME:
        payload = {
            "messaging_product": "whatsapp",
            "to": recipient,
            "type": "template",
            "template": {
                "name": settings.WHATSAPP_TEMPLATE_NAME,
                "language": {"code": settings.WHATSAPP_TEMPLATE_LANGUAGE},
                "components": [
                    {
                        "type": "body",
                        "parameters": [{"type": "text", "text": value} for value in _template_parameters(order)],
                    }
                ],
            },
        }
    else:
        # Texte libre : ne fonctionne que dans la fenetre de conversation
        # client de 24h (voir docstring du module). Fourni comme repli
        # tant qu'aucun modele n'est approuve.
        payload = {
            "messaging_product": "whatsapp",
            "to": recipient,
            "type": "text",
            "text": {"body": build_confirmation_message(order)},
        }

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        return response.status_code == 200
    except requests.RequestException:
        return False
