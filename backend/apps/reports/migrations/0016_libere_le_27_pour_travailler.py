from django.db import migrations

# La fermeture regroupee du 26 (id 10) couvrait aussi le 27 (covers_through=27), ce qui bloquait toute
# nouvelle vente aujourd'hui ("Caisse fermee pour aujourd'hui... bloquees jusqu'a demain"). Les montants
# (48000 especes + 17900 Wave) restent corrects et inchanges : ils incluent deja les 5 ventes faites juste
# apres minuit le 27 (00h16-00h29). On retire seulement covers_through pour liberer le 27 et permettre au
# caissier d'ouvrir sa caisse et vendre normalement aujourd'hui.
def liberer(apps, schema_editor):
    DailyClosing = apps.get_model("reports", "DailyClosing")
    PointOfSale = apps.get_model("stores", "PointOfSale")
    User = apps.get_model("auth", "User")

    store = PointOfSale.objects.filter(name__icontains="Resto").first()
    cashier = User.objects.filter(username="Resto").first()
    if not store or not cashier:
        return

    DailyClosing.objects.filter(point_of_sale=store, cashier=cashier, date="2026-09-26", covers_through="2026-09-27").update(
        covers_through=None
    )


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("reports", "0015_corrige_fermeture_auto_25_ventes_apres_minuit"),
    ]

    operations = [
        migrations.RunPython(liberer, noop),
    ]
