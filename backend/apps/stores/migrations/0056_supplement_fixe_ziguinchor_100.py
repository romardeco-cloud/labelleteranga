from django.db import migrations

# Demande de l'admin (03/10/2026) : supplement fixe de 100 FCFA sur les prix du Supermarche de Ziguinchor, en plus des
# 15 % (les prix fixes saisis pour ce magasin restent prioritaires). Modifiable dans Admin > Parametres.


def appliquer(apps, schema_editor):
    PointOfSale = apps.get_model("stores", "PointOfSale")
    StoreSettings = apps.get_model("stores", "StoreSettings")
    zig = PointOfSale.objects.filter(slug="supermarche-la-belle-teranga-ziguinchor").first()
    if zig:
        settings, _ = StoreSettings.objects.get_or_create(point_of_sale=zig)
        settings.price_markup_amount = 100
        settings.save(update_fields=["price_markup_amount"])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [("stores", "0055_supplement_montant_fixe")]
    operations = [migrations.RunPython(appliquer, noop)]
