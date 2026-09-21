import re
import unicodedata

from django.db import migrations


def _norm(text):
    return re.sub(r"[^a-z0-9]+", "", unicodedata.normalize("NFKD", str(text or "")).encode("ascii", "ignore").decode().lower())


BANDS = [
    ("Nos Combos", "Des formules complètes à prix fixe : pizzas, poulet braisé, plats sénégalais, frites et boissons pour toute la famille.", None, True),
    ("Nos Pizzas Artisanales", "Pâte fraîche, four chaud et ingrédients de qualité, cuites à la commande.", "Pizzas", False),
    ("Nos Jus Naturels", "Fraîcheur et bon goût : des jus 100% naturels préparés chaque jour, sans conservateurs.", "Boissons et jus", False),
]


def create_bands(apps, schema_editor):
    """Bandes de pub du site du restaurant, alimentees automatiquement par la categorie (ou les combos) : elles restent cachees tant qu'elles n'ont aucun plat avec un prix."""
    PointOfSale = apps.get_model("stores", "PointOfSale")
    PromoBand = apps.get_model("stores", "PromoBand")
    Category = apps.get_model("catalog", "Category")
    cats = list(Category.objects.all())
    for store in PointOfSale.objects.filter(slug="resto"):
        for order, (title, text, cat_name, combos) in enumerate(BANDS):
            category = next((c for c in cats if cat_name and _norm(c.name) == _norm(cat_name)), None)
            PromoBand.objects.get_or_create(
                point_of_sale=store,
                title=title,
                defaults={"text": text, "category": category, "include_combos": combos, "order": order, "is_active": True, "show_prices": True},
            )


class Migration(migrations.Migration):

    dependencies = [
        ("stores", "0033_bandes_de_pub"),
        ("catalog", "0011_classer_produits"),
    ]

    operations = [migrations.RunPython(create_bands, migrations.RunPython.noop)]
