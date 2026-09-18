from django.db import migrations
from django.utils.text import slugify

CATEGORIES = [
    "FRUITS & LEGUMES",
    "CHARCUTERIE",
    "FROMAGERIE",
    "PÂTISSERIE",
    "GATINEAU",
    "PRODUITS SECS",
    "PRODUITS LAITIERS",
    "PRODUITS LIQUIDES",
    "PRODUITS D'HYGIÈNES",
    "PAPETERIES",
    "PRODUITS DE BÉBÉ",
]


def seed(apps, schema_editor):
    Category = apps.get_model("catalog", "Category")
    for name in CATEGORIES:
        Category.objects.get_or_create(name=name, defaults={"slug": slugify(name)})


class Migration(migrations.Migration):
    dependencies = [("catalog", "0004_promotion")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
