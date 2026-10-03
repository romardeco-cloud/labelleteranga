from decimal import Decimal

from django.db import migrations

# Demande de l'admin (03/10/2026) : formats des 11 produits ajoutes le 03/10 (tailles visibles sur leurs photos), avec
# des prix estimes du marche senegalais ; categorie, prix de base (plus petit format) et mise en vente. Canettes pour
# les sodas et jus du Supermarche (pas pour l'eau).
NOUVEAUX = {
    (1888, "farine blédor", "Famille riz & Farine"): [("1 kg", 650), ("2 kg", 1300), ("5 kg", 3000), ("10 kg", 5800), ("25 kg", 13500), ("50 kg", 25500)],
    (1889, "farine de blé", "Famille riz & Farine"): [("1 kg", 600), ("5 kg", 2750), ("25 kg", 11500), ("50 kg", 22000)],
    (1890, "farine nma", "Famille riz & Farine"): [("1 kg", 650), ("2 kg", 1250), ("5 kg", 3000), ("10 kg", 5800), ("25 kg", 13500)],
    (1891, "farines adja", "Famille riz & Farine"): [("1 kg", 650), ("2 kg", 1250), ("5 kg", 3000), ("10 kg", 5800), ("25 kg", 13500), ("50 kg", 25000)],
    (1892, "huile d", "Famille huiles"): [("250 ml", 2000), ("500 ml", 3500), ("1 L", 6500), ("1,5 L", 9500), ("2 L", 12500), ("5 L", 30000)],
    (1893, "lait bridel", "Produits laitiers"): [("20 cl", 400), ("50 cl", 800), ("1 L", 1500), ("1,5 L", 2200), ("2 L", 2900)],
    (1894, "lait en poudre halib", "Produits laitiers"): [("25 g", 100), ("50 g", 200), ("100 g", 400), ("200 g", 800), ("400 g", 1600), ("900 g", 3500), ("1,8 kg", 6800), ("2,5 kg", 9000), ("5 kg", 17500), ("10 kg", 34000), ("25 kg", 82000)],
    (1895, "lait en poudre laicran", "Produits laitiers"): [("25 g", 100), ("50 g", 200), ("100 g", 400), ("200 g", 800), ("400 g", 1700), ("900 g", 3700), ("1,8 kg", 7200), ("2,5 kg", 9500), ("5 kg", 18500), ("25 kg", 88000)],
    (1896, "lait en poudre nido", "Produits laitiers"): [("50 g", 350), ("400 g", 2700), ("900 g", 5800), ("1,8 kg", 11000), ("2,5 kg", 15000)],
    (1897, "lait en poudre vitalait", "Produits laitiers"): [("25 g", 100), ("50 g", 200), ("100 g", 400), ("200 g", 750), ("400 g", 1500), ("900 g", 3300), ("1,8 kg", 6400), ("2,5 kg", 8500), ("5 kg", 16500), ("25 kg", 80000)],
    (1898, "mangues", "Fruits et légumes"): [("1 kg", 800), ("5 kg", 3500)],
}
# sodas et jus du Supermarche : canette 33 cl et pack de 6
CANETTES = {1820: "ananas", 1824: "boissons coca", 1857: "fanta", 1858: "jus d", 1860: "sprite"}
SUPERMARCHE = 1


def appliquer(apps, schema_editor):
    Product = apps.get_model("catalog", "Product")
    ProductVariant = apps.get_model("catalog", "ProductVariant")
    Category = apps.get_model("catalog", "Category")
    StoreCategory = apps.get_model("stores", "StoreCategory")

    for (pk, debut, categorie), formats in NOUVEAUX.items():
        p = Product.objects.filter(pk=pk).first()
        if not p or not p.name.lower().startswith(debut) or ProductVariant.objects.filter(product=p).exists():
            continue
        for i, (label, prix) in enumerate(formats):
            ProductVariant.objects.create(product=p, label=label, price=Decimal(prix), order=i, is_active=True)
        cat = Category.objects.filter(name=categorie).first()
        if cat and p.category_id is None:
            p.category = cat
            StoreCategory.objects.get_or_create(point_of_sale_id=SUPERMARCHE, category=cat)
        p.price = Decimal(min(prix for _, prix in formats))
        p.is_active = True
        p.save(update_fields=["category", "price", "is_active"])

    for pk, debut in CANETTES.items():
        p = Product.objects.filter(pk=pk).first()
        if not p or not p.name.lower().startswith(debut):
            continue
        formats = ProductVariant.objects.filter(product=p)
        dernier = max([f.order for f in formats], default=-1)
        for i, (label, prix) in enumerate((("Canette 33 cl", 500), ("Pack 6 canettes", 2800))):
            if not formats.filter(label__iexact=label).exists():
                ProductVariant.objects.create(product=p, label=label, price=Decimal(prix), order=dernier + 1 + i, is_active=True)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [("catalog", "0024_photo_huile_olive"), ("stores", "0051_stockmovement_variant_variantstock")]
    operations = [migrations.RunPython(appliquer, noop)]
