from django.db import migrations

# Supprime l'ouverture de caisse du 27/09 deja enregistree (5000 FCFA), pour que le caissier soit invite a
# saisir lui-meme son fond de caisse a la prochaine ouverture (le compte du jour repart a zero).


def reinitialiser(apps, schema_editor):
    CashierOpening = apps.get_model("reports", "CashierOpening")
    PointOfSale = apps.get_model("stores", "PointOfSale")
    User = apps.get_model("auth", "User")

    store = PointOfSale.objects.filter(name__icontains="Resto").first()
    cashier = User.objects.filter(username="Resto").first()
    if not store or not cashier:
        return

    CashierOpening.objects.filter(date="2026-09-27", point_of_sale=store, cashier=cashier).delete()


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("reports", "0016_libere_le_27_pour_travailler"),
    ]

    operations = [
        migrations.RunPython(reinitialiser, noop),
    ]
