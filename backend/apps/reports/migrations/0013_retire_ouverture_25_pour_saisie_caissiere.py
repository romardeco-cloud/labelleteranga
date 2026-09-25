from django.db import migrations


def retire_ouverture(apps, schema_editor):
    """
    Retire l'ouverture de caisse du 25/09 deja enregistree (creee plus tot pendant les tests), pour que la
    caissiere fasse elle-meme la saisie de son propre fond de caisse aujourd'hui.
    """
    CashierOpening = apps.get_model("reports", "CashierOpening")
    PointOfSale = apps.get_model("stores", "PointOfSale")
    User = apps.get_model("auth", "User")

    store = PointOfSale.objects.filter(name__icontains="Resto").first()
    cashier = User.objects.filter(username="Resto").first()
    if not store or not cashier:
        return

    CashierOpening.objects.filter(date="2026-09-25", point_of_sale=store, cashier=cashier).delete()


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("reports", "0012_liberer_le_25_pour_travailler"),
    ]

    operations = [
        migrations.RunPython(retire_ouverture, noop),
    ]
