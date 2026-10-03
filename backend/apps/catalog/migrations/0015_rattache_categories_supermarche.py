from django.db import migrations
from django.db.models import Max

# Categories creees pour le Supermarche le 02-03/10/2026 depuis Admin > Produits, avant que la creation ne les
# rattache automatiquement au point de vente : sans lien, elles restaient invisibles tant qu'elles etaient vides.
CATEGORIES = {71: "Papeterie", 74: "Poissonnerie", 76: "Boucherie / Volaille", 78: "Épicerie salée"}
SUPERMARCHE = 1


def rattacher(apps, schema_editor):
    Category = apps.get_model("catalog", "Category")
    PointOfSale = apps.get_model("stores", "PointOfSale")
    StoreCategory = apps.get_model("stores", "StoreCategory")
    if not PointOfSale.objects.filter(pk=SUPERMARCHE, slug="supermarche").exists():
        return
    last = StoreCategory.objects.filter(point_of_sale_id=SUPERMARCHE).aggregate(m=Max("order"))["m"] or 0
    for pk, nom in CATEGORIES.items():
        if Category.objects.filter(pk=pk, name=nom).exists():
            _, cree = StoreCategory.objects.get_or_create(point_of_sale_id=SUPERMARCHE, category_id=pk, defaults={"order": last + 1})
            last += cree


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [("catalog", "0014_zone_prix_photo"), ("stores", "0050_companybranding")]
    operations = [migrations.RunPython(rattacher, noop)]
