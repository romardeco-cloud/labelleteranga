from django.db import migrations


def classify(apps, schema_editor):
    """Range dans leur categorie les produits sans categorie reconnus par leur nom (catalogue de reference du supermarche)."""
    try:
        from apps.catalog.categorizer import assign, get_category, guess_category
        from apps.catalog.models import Product

        cache, done = {}, 0
        for product in Product.objects.filter(category__isnull=True).prefetch_related("stocks"):
            guess = guess_category(product.name)
            if guess:
                assign(product, get_category(guess, cache))
                done += 1
        print(f"[0011_classer_produits] {done} produit(s) classe(s)")
    except Exception as exc:  # noqa: BLE001
        print(f"[0011_classer_produits] ignore : {exc}")


class Migration(migrations.Migration):
    dependencies = [("catalog", "0010_restore_resto_prices")]
    operations = [migrations.RunPython(classify, migrations.RunPython.noop)]
