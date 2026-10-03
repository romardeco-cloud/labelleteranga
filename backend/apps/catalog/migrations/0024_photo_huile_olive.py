import os

from django.core.files.base import ContentFile
from django.db import migrations

# Photo de l'huile d'olive du Supermarche (creee en 0021, sans photo). Source : Wikimedia Commons,
# "Bottle of olive oil.jpg", licence CC0 (domaine public), recadree en carre 1200 px.
ASSET = os.path.join(os.path.dirname(__file__), "..", "migration_assets", "huile_olive.jpg")


def appliquer(apps, schema_editor):
    Product = apps.get_model("catalog", "Product")
    p = Product.objects.filter(sku="SUPERM-HUILE-OLIVE").first()
    if not p or p.image:
        return  # produit absent, ou une photo a deja ete ajoutee entre-temps
    with open(ASSET, "rb") as f:
        p.image.save("huile_olive.jpg", ContentFile(f.read()), save=True)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [("catalog", "0023_prix_tacos_burgers_poulet")]
    operations = [migrations.RunPython(appliquer, noop)]
