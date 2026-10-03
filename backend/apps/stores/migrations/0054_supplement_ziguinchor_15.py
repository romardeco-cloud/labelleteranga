from decimal import Decimal

from django.db import migrations

# Demande de l'admin (03/10/2026) : supplement transport de 15 % sur les prix du Supermarche de Ziguinchor (les prix
# fixes saisis pour ce magasin, produit par produit, restent prioritaires). Modifiable dans Admin > Parametres.


def appliquer(apps, schema_editor):
    PointOfSale = apps.get_model("stores", "PointOfSale")
    StoreSettings = apps.get_model("stores", "StoreSettings")
    zig = PointOfSale.objects.filter(slug="supermarche-la-belle-teranga-ziguinchor").first()
    if zig:
        settings, _ = StoreSettings.objects.get_or_create(point_of_sale=zig)
        settings.price_markup_percent = Decimal("15")
        settings.save(update_fields=["price_markup_percent"])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [("stores", "0053_prix_par_magasin")]
    operations = [migrations.RunPython(appliquer, noop)]
