from django.db import migrations

# References des 3 ventes de test faites juste apres minuit (25/09) : 700 FCFA especes + 5000 et 1000 FCFA
# Wave (6000 FCFA au total). A la demande de l'utilisateur, leur montant est ajoute a la fermeture du 24/09
# deja cloturee. Les ventes elles-memes NE SONT PAS touchees ici (ni horodatage, ni statut) : annuler une
# vente est une action volontairement protegee par code secret admin (voir apps/orders/views.py OrderViewSet.void),
# et doit donc etre faite via l'ecran Admin > Commandes et ventes, jamais depuis une migration qui
# contournerait cette protection.
ADDED_CASH = 700
ADDED_WAVE = 6000


def rattacher(apps, schema_editor):
    DailyClosing = apps.get_model("reports", "DailyClosing")
    PointOfSale = apps.get_model("stores", "PointOfSale")
    User = apps.get_model("auth", "User")

    store = PointOfSale.objects.filter(name__icontains="Resto").first()
    cashier = User.objects.filter(username="Resto").first()
    if not store or not cashier:
        return

    closing = DailyClosing.objects.filter(point_of_sale=store, cashier=cashier, date="2026-09-24").first()
    if not closing:
        return

    closing.expected_cash += ADDED_CASH
    closing.declared_cash += ADDED_CASH
    closing.expected_wave += ADDED_WAVE
    closing.declared_wave += ADDED_WAVE
    note = (
        "Inclut 6700 FCFA de ventes faites juste apres minuit (25/09, 700 especes + 6000 Wave). "
        "A faire manuellement : annuler ces 3 ventes dans Commandes et ventes (code secret admin) pour "
        "qu'elles ne soient pas recomptees dans la fermeture du 25."
    )
    closing.notes = f"{closing.notes} {note}".strip() if closing.notes else note
    closing.save()


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("reports", "0013_retire_ouverture_25_pour_saisie_caissiere"),
    ]

    operations = [
        migrations.RunPython(rattacher, noop),
    ]
