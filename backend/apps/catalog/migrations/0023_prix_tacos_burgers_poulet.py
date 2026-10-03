from decimal import Decimal

from django.db import migrations

# Demande de l'admin (03/10/2026) : vrais prix des 3 produits du Supermarche restes au prix provisoire de 10 000 F.
PRIX = {1884: ("tacos", 18000), 1881: ("boîte de burgers", 40000), 1880: ("poulet entier", 4000)}


def appliquer(apps, schema_editor):
    Product = apps.get_model("catalog", "Product")
    for pk, (debut, prix) in PRIX.items():
        Product.objects.filter(pk=pk, name__istartswith=debut).update(price=Decimal(prix))


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [("catalog", "0022_formats_supermarche_en_vente")]
    operations = [migrations.RunPython(appliquer, noop)]
