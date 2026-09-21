import re
import unicodedata

from django.db import migrations


def _norm(text):
    return re.sub(r"[^a-z0-9]+", "", unicodedata.normalize("NFKD", str(text or "")).encode("ascii", "ignore").decode().lower())


def apply_prices(apps, schema_editor):
    """Le prix saisi sur chaque combo (Admin > Combos) est applique au produit du meme nom dans le restaurant : c'est lui qu'affiche le menu du site."""
    PointOfSale = apps.get_model("stores", "PointOfSale")
    Combo = apps.get_model("stores", "Combo")
    Stock = apps.get_model("stores", "Stock")
    Product = apps.get_model("catalog", "Product")
    for store in PointOfSale.objects.filter(slug="resto"):
        product_ids = set(Stock.objects.filter(point_of_sale=store).values_list("product_id", flat=True))
        shared = set(Stock.objects.filter(product_id__in=product_ids).exclude(point_of_sale=store).values_list("product_id", flat=True))
        products = {}
        for p in Product.objects.filter(pk__in=product_ids - shared):
            products.setdefault(_norm(p.name), p)
        for combo in Combo.objects.filter(point_of_sale=store, price__gt=0):
            product = products.get(_norm(combo.name))
            if product is not None and product.price != combo.price:
                product.price = combo.price
                product.save(update_fields=["price"])


class Migration(migrations.Migration):

    dependencies = [
        ("stores", "0031_categories_resto"),
        ("catalog", "0011_classer_produits"),
    ]

    operations = [migrations.RunPython(apply_prices, migrations.RunPython.noop)]
