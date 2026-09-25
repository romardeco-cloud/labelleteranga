from django.db import migrations


def synchroniser(apps, schema_editor):
    """
    Applique le prix de chaque combo (Admin > Combos) au produit du meme nom vendu dans le meme point de
    vente : c'est ce prix que le menu du site et la caisse affichent pour ce produit. Reutilise exactement
    la logique du bouton "Appliquer les prix aux produits" (apps/stores/views_engagement.py:sync_combo_prices),
    en la rejouant ici via l'ORM des migrations pour tous les points de vente.
    """
    import unicodedata

    Combo = apps.get_model("stores", "Combo")
    Product = apps.get_model("catalog", "Product")
    Stock = apps.get_model("stores", "Stock")
    PointOfSale = apps.get_model("stores", "PointOfSale")

    def norm(name):
        s = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode()
        return " ".join(s.lower().split())

    for store in PointOfSale.objects.all():
        product_ids = set(Stock.objects.filter(point_of_sale=store).values_list("product_id", flat=True))
        shared = set(
            Stock.objects.filter(product_id__in=product_ids).exclude(point_of_sale=store).values_list("product_id", flat=True)
        )
        products = {}
        for p in Product.objects.filter(pk__in=product_ids):
            products.setdefault(norm(p.name), p)

        for combo in Combo.objects.filter(point_of_sale=store):
            if combo.price <= 0:
                continue
            product = products.get(norm(combo.name))
            if product is None or product.pk in shared:
                continue
            if product.price != combo.price:
                product.price = combo.price
                product.save(update_fields=["price"])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("stores", "0043_diversifie_famille_pizza_party_yassa"),
    ]

    operations = [
        migrations.RunPython(synchroniser, noop),
    ]
