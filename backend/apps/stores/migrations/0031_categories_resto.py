import re
import unicodedata

from django.db import migrations
from django.utils.text import slugify

from apps.catalog.resto_rules import ORDER, guess_resto_category


def _norm(text):
    text = unicodedata.normalize("NFKD", str(text or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "", text)


def organize(apps, schema_editor):
    """Range les plats du restaurant par categories d'apres leur nom (Poulet et grillades, Pizzas, Boissons et jus, Combos...)."""
    PointOfSale = apps.get_model("stores", "PointOfSale")
    Stock = apps.get_model("stores", "Stock")
    StoreCategory = apps.get_model("stores", "StoreCategory")
    Category = apps.get_model("catalog", "Category")
    Product = apps.get_model("catalog", "Product")

    def get_category(name, cache):
        key = _norm(name)
        if key not in cache:
            found = next((c for c in Category.objects.all() if _norm(c.name) == key), None)
            if found is None:  # le modele de migration n'a pas la methode save() qui fabrique le slug
                slug, n = slugify(name), 2
                while Category.objects.filter(slug=slug).exists():
                    slug, n = f"{slugify(name)}-{n}", n + 1
                found = Category.objects.create(name=name, slug=slug)
            cache[key] = found
        return cache[key]

    cache = {}
    for store in PointOfSale.objects.filter(slug="resto"):
        product_ids = set(Stock.objects.filter(point_of_sale=store).values_list("product_id", flat=True))
        # les produits vendus aussi par un autre point de vente ne sont pas touches (leur categorie est commune)
        shared = set(Stock.objects.filter(product_id__in=product_ids).exclude(point_of_sale=store).values_list("product_id", flat=True))
        for product in Product.objects.filter(pk__in=product_ids - shared):
            wanted = guess_resto_category(product.name)
            if not wanted:
                continue
            category = get_category(wanted, cache)
            if product.category_id != category.pk:
                product.category = category
                product.save(update_fields=["category"])

        # filtres du point de vente : dans l'ordre du menu, puis les autres ; les categories devenues vides disparaissent
        used = set(Product.objects.filter(pk__in=product_ids).exclude(category=None).values_list("category_id", flat=True))
        for link in StoreCategory.objects.filter(point_of_sale=store):
            if link.category_id not in used:
                link.delete()
        for position, name in enumerate(ORDER):
            category = next((c for c in Category.objects.all() if _norm(c.name) == _norm(name)), None)
            if category is None or category.pk not in used:
                continue
            link, _ = StoreCategory.objects.get_or_create(point_of_sale=store, category=category, defaults={"order": position})
            if link.order != position:
                link.order = position
                link.save(update_fields=["order"])
        listed = {_norm(n) for n in ORDER}
        for link in StoreCategory.objects.filter(point_of_sale=store).select_related("category"):
            if _norm(link.category.name) not in listed:
                link.order = 100 + link.order  # les categories personnalisees apres celles du menu
                link.save(update_fields=["order"])


class Migration(migrations.Migration):

    dependencies = [
        ("stores", "0030_categorie_nom_par_point_de_vente"),
        ("catalog", "0011_classer_produits"),
    ]

    operations = [
        migrations.RunPython(organize, migrations.RunPython.noop),
    ]
