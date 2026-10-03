from django.db import migrations

# Demande de l'admin (03/10/2026) : les boissons du Supermarche sans format prennent les memes formats et prix que
# l'eau "La Casamancaise" (copies au moment du deploiement) ; le Fanta garde ses propres prix. Stock non suivi pour
# ces 7 boissons (sinon "Rupture" : aucun stock saisi par format).
MODELE = 1856  # Eau la casamancaise
CIBLES = {1820: "Ananas", 1824: "Boissons coca cola", 1858: "Jus d", 1859: "Kir", 1860: "Sprite"}
SANS_SUIVI = [1820, 1824, 1856, 1857, 1858, 1859, 1860]
SUPERMARCHE = 1


def appliquer(apps, schema_editor):
    Product = apps.get_model("catalog", "Product")
    ProductVariant = apps.get_model("catalog", "ProductVariant")
    Stock = apps.get_model("stores", "Stock")
    modele = list(ProductVariant.objects.filter(product_id=MODELE, product__name__icontains="casaman").order_by("order", "id"))
    if not modele:
        return
    for pk, debut in CIBLES.items():
        p = Product.objects.filter(pk=pk, name__istartswith=debut).first()
        if not p or ProductVariant.objects.filter(product=p).exists():
            continue  # produit renomme/supprime, ou formats deja definis : on ne touche a rien
        for v in modele:
            ProductVariant.objects.create(product=p, label=v.label, price=v.price, order=v.order, is_active=v.is_active)
    Stock.objects.filter(point_of_sale_id=SUPERMARCHE, product_id__in=SANS_SUIVI).update(track_stock=False)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [("catalog", "0017_product_sold_by_weight_productvariant"), ("stores", "0051_stockmovement_variant_variantstock")]
    operations = [migrations.RunPython(appliquer, noop)]
