from decimal import Decimal

from django.db import migrations

# Ventes en caisse du Resto faites juste apres minuit (24/09, 25/09 et 26/09/2026) : comptees dans la fermeture de
# la veille, puis annulees a la main pour ne pas etre recomptees le lendemain. Depuis la correction de
# apps.pos.services (_grace_q), une vente d'apres minuit faite avant la fermeture appartient a cette fermeture et
# n'est plus jamais recomptee : on les remet en "payee" pour qu'elles reapparaissent dans les rapports (20 900 FCFA).
# Aucun mouvement de stock n'avait ete fait (le Resto ne suit pas son stock).
VENTES = {
    93: "700", 94: "5000", 95: "1000",
    117: "1500", 118: "1400", 119: "1400", 120: "1000",
    147: "3000", 148: "1000", 149: "2000", 150: "1500", 151: "1400",
}


def retablir(apps, schema_editor):
    Order = apps.get_model("orders", "Order")
    orders = list(Order.objects.filter(pk__in=VENTES, channel="pos", status="cancelled"))
    # rien n'est modifie si l'etat ne correspond plus exactement a celui constate le 02/10/2026
    if len(orders) != len(VENTES) or any(o.total_amount != Decimal(VENTES[o.pk]) for o in orders):
        return
    for o in orders:
        o.status = "paid"
        o.voided_at = None
        o.voided_by = None
        o.void_reason = ""
        o.save(update_fields=["status", "voided_at", "voided_by", "void_reason"])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [("orders", "0018_order_orange_money_webhook_token")]
    operations = [migrations.RunPython(retablir, noop)]
