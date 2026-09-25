from django.db import migrations


def open_tomorrow(apps, schema_editor):
    """
    Prepare l'ouverture de caisse du 26/09/2026 pour le caissier Resto, avec le fond de caisse habituel
    (5000 FCFA, comme chaque jour precedent) : la journee du 25 a ete cloturee (regroupee avec le 24) a 2h du
    matin, avant l'heure normale de fermeture ; l'ouverture du lendemain est prevue a l'avance pour que le
    caissier puisse reprendre la vente sans attendre.
    """
    CashierOpening = apps.get_model("reports", "CashierOpening")
    PointOfSale = apps.get_model("stores", "PointOfSale")
    User = apps.get_model("auth", "User")

    store = PointOfSale.objects.filter(name__icontains="Resto").first()
    cashier = User.objects.filter(username="Resto").first()
    if not store or not cashier:
        return

    CashierOpening.objects.update_or_create(
        date="2026-09-26",
        point_of_sale=store,
        cashier=cashier,
        defaults={"opening_cash": 5000, "notes": "Fond de caisse habituel (prepare a l'avance)."},
    )


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("reports", "0010_corrige_double_comptage_fond_de_caisse"),
    ]

    operations = [
        migrations.RunPython(open_tomorrow, noop),
    ]
