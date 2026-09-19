from django.db import migrations


def apply(apps, schema_editor):
    PointOfSale = apps.get_model("stores", "PointOfSale")
    StoreSettings = apps.get_model("stores", "StoreSettings")
    resto = PointOfSale.objects.filter(name__istartswith="Resto").first()
    if resto:
        st, _ = StoreSettings.objects.get_or_create(point_of_sale=resto)
        st.track_stock = False  # plats faits a la commande : pas de rupture de stock
        st.save()


class Migration(migrations.Migration):
    dependencies = [("stores", "0009_storesettings_track_stock")]
    operations = [migrations.RunPython(apply, migrations.RunPython.noop)]
