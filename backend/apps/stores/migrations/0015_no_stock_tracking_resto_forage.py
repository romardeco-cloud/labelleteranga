from django.db import migrations


def disable_tracking(apps, schema_editor):
    """Restaurant (plats prepares, livraison...) et service de forage : pas de controle de stock. Les autres points de vente ne changent pas."""
    PointOfSale = apps.get_model("stores", "PointOfSale")
    StoreSettings = apps.get_model("stores", "StoreSettings")
    for store in PointOfSale.objects.filter(slug__in=["resto", "forage"]):
        settings, _ = StoreSettings.objects.get_or_create(point_of_sale=store)
        if settings.track_stock:
            settings.track_stock = False
            settings.save(update_fields=["track_stock"])


class Migration(migrations.Migration):
    dependencies = [("stores", "0014_storesettings_loyalty_enabled_and_more")]
    operations = [migrations.RunPython(disable_tracking, migrations.RunPython.noop)]
