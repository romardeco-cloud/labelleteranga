from decimal import Decimal

from django.db import migrations

# Demande de l'admin (03/10/2026) : Fanta 1,5L a 800 FCFA.


def appliquer(apps, schema_editor):
    ProductVariant = apps.get_model("catalog", "ProductVariant")
    ProductVariant.objects.filter(product_id=1857, product__name__icontains="fanta", label__in=["1,5L", "1.5L"]).update(price=Decimal("800"))


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [("catalog", "0019_coca_1l5_et_format_33cl")]
    operations = [migrations.RunPython(appliquer, noop)]
