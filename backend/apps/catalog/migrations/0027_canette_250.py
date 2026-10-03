from decimal import Decimal

from django.db import migrations

# Demande de l'admin (03/10/2026) : la canette 33 cl coute 250 FCFA (sodas et jus du Supermarche).


def appliquer(apps, schema_editor):
    ProductVariant = apps.get_model("catalog", "ProductVariant")
    ProductVariant.objects.filter(product_id__in=[1820, 1824, 1857, 1858, 1860], label="Canette 33 cl").update(price=Decimal("250"))


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [("catalog", "0026_stock_non_suivi_nouveaux_produits")]
    operations = [migrations.RunPython(appliquer, noop)]
