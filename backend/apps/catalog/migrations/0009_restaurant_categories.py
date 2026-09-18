from django.db import migrations
from django.utils.text import slugify

NEW_CATEGORIES = ["FAST FOOD", "PIZZA", "LIVRAISON", "BOISSONS FRAICHES", "REPAS MIDI", "DESSERT", "BOISSONS CHAUDES"]

# reference (sku du menu du restaurant) -> categorie
MENU = {
    "FAST FOOD": ["RESTO-001", "RESTO-002", "RESTO-003", "RESTO-004", "RESTO-007", "RESTO-008", "RESTO-009", "RESTO-010",
                  "RESTO-014", "RESTO-015", "RESTO-019", "RESTO-021", "RESTO-022", "RESTO-023", "RESTO-024", "RESTO-025"],
    "PIZZA": ["RESTO-020"],
    "REPAS MIDI": ["RESTO-005", "RESTO-012", "RESTO-013", "RESTO-026", "RESTO-027", "RESTO-028", "RESTO-029", "RESTO-030",
                   "RESTO-031", "RESTO-032"],
    "PÂTISSERIE": ["RESTO-016", "RESTO-017", "RESTO-018"],
    "DESSERT": ["RESTO-011"],
    "BOISSONS FRAICHES": ["RESTO-033"],
    "BOISSONS CHAUDES": ["RESTO-006", "RESTO-034"],
}


def apply(apps, schema_editor):
    Category = apps.get_model("catalog", "Category")
    Product = apps.get_model("catalog", "Product")
    for name in NEW_CATEGORIES:
        Category.objects.get_or_create(name=name, defaults={"slug": slugify(name)})
    for name, skus in MENU.items():
        cat, _ = Category.objects.get_or_create(name=name, defaults={"slug": slugify(name)})
        Product.objects.filter(sku__in=skus).update(category=cat)


class Migration(migrations.Migration):
    dependencies = [("catalog", "0008_rename_gateau_accent")]
    operations = [migrations.RunPython(apply, migrations.RunPython.noop)]
