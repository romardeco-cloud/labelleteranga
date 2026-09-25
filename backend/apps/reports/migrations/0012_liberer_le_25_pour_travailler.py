from django.db import migrations


def liberer_le_25(apps, schema_editor):
    """
    Retire l'ouverture du 26/09 preparee a l'avance (le caissier ouvrira lui-meme quand il commencera a
    travailler), et retire le "covers_through" de la fermeture regroupee du 24-25/09 : elle reste une
    fermeture valide du 24 (montants corriges conserves), mais ne bloque plus le 25, pour que le caissier
    puisse ouvrir sa caisse et continuer a vendre aujourd'hui.
    """
    CashierOpening = apps.get_model("reports", "CashierOpening")
    DailyClosing = apps.get_model("reports", "DailyClosing")
    PointOfSale = apps.get_model("stores", "PointOfSale")
    User = apps.get_model("auth", "User")

    store = PointOfSale.objects.filter(name__icontains="Resto").first()
    cashier = User.objects.filter(username="Resto").first()
    if not store or not cashier:
        return

    CashierOpening.objects.filter(date="2026-09-26", point_of_sale=store, cashier=cashier).delete()
    DailyClosing.objects.filter(
        covers_through="2026-09-25", point_of_sale=store, cashier=cashier
    ).update(covers_through=None)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("reports", "0011_ouverture_caisse_resto_26_sept"),
    ]

    operations = [
        migrations.RunPython(liberer_le_25, noop),
    ]
