from django.db import migrations

# La migration 0045 forcait le produit "Combo pizza party" a 27000 en supposant que le combo etait reste
# a ce prix. En realite le combo lui-meme avait deja ete mis a jour a 28000 entre-temps (modification live
# de l'utilisateur dans Admin > Combos) : la migration 0044 avait donc raison de ne rien changer (les deux
# etaient deja a 28000). Cette migration annule l'erreur de 0045 en rejouant la synchronisation generale
# (identique a 0044) sur l'etat actuel des prix, qui a pu bouger depuis.


def synchroniser(apps, schema_editor):
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
                Product.objects.filter(pk=product.pk).update(price=combo.price)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("stores", "0045_diagnostic_prix_pizza_party"),
    ]

    operations = [
        migrations.RunPython(synchroniser, noop),
    ]
