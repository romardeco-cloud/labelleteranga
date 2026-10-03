from django.db import migrations

# Les 11 produits ajoutes le 03/10 avaient le suivi de stock actif (stock 0 -> "Rupture"), contrairement aux autres
# produits du Supermarche : suivi desactive, comme pour le reste du magasin.


def appliquer(apps, schema_editor):
    Stock = apps.get_model("stores", "Stock")
    Stock.objects.filter(point_of_sale_id=1, product_id__in=range(1888, 1899)).update(track_stock=False)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [("catalog", "0025_nouveaux_produits_et_canettes")]
    operations = [migrations.RunPython(appliquer, noop)]
