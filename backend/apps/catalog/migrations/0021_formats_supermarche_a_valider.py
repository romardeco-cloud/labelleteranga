from decimal import Decimal

from django.db import migrations

# Demande de l'admin (03/10/2026) : formats courants au Senegal pour les produits du Supermarche, avec des prix
# ESTIMES, ajoutes "hors vente" (is_active=False) : rien ne change pour les clients tant que l'admin n'a pas verifie
# le prix et coche "En vente" (Admin > Produits > Formats). Produits qui ont deja des formats : non touches.
# (id, debut du nom pour verifier que c'est bien le meme produit) -> [(format, prix estime)]
FORMATS = {
    (1862, "huile"): [("20 L", 25000), ("5 L", 6500), ("1 L", 1400)],
    (1861, "farine"): [("50 kg", 22000), ("25 kg", 11500), ("5 kg", 2750), ("1 kg", 600)],
    (1870, "sucre en poudre"): [("50 kg", 32500), ("25 kg", 16500), ("5 kg", 3500), ("1 kg", 700)],
    (1869, "sucre en morceaux"): [("1 kg", 900), ("500 g", 500)],
    (1868, "spaghetti"): [("Carton 20 x 500 g", 7500), ("500 g", 400)],
    (1825, "café touba"): [("1 kg", 4000), ("500 g", 2000), ("250 g", 1000)],
    (1865, "nexpress"): [("200 g", 4800), ("100 g", 2500), ("50 g", 1300)],
    (1866, "nido"): [("2,5 kg", 14000), ("900 g", 5500), ("400 g", 2500)],
    (1864, "lait lecran"): [("2,5 kg", 14000), ("900 g", 5500), ("400 g", 2500)],
    (1863, "lait entier halib"): [("1 L", 1300), ("500 ml", 700)],
    (1834, "oignons frais"): [("25 kg", 12500), ("5 kg", 2800), ("1 kg", 600)],
    (1842, "pommes de terre"): [("25 kg", 13000), ("5 kg", 2800), ("1 kg", 600)],
    (1847, "tomates"): [("5 kg", 3500), ("1 kg", 800), ("500 g", 400)],
    (1846, "sac de carottes"): [("5 kg", 2800), ("1 kg", 600), ("500 g", 300)],
    (1821, "aubergines"): [("1 kg", 700), ("500 g", 350)],
    (1830, "concombres"): [("1 kg", 600), ("500 g", 300)],
    (1832, "gombos"): [("1 kg", 1000), ("500 g", 500)],
    (1838, "patates douces"): [("5 kg", 2500), ("1 kg", 500)],
    (1841, "poivrons"): [("1 kg", 1200), ("500 g", 600)],
    (1818, "ail"): [("1 kg", 2000), ("250 g", 500)],
    (1831, "gingembre"): [("1 kg", 2000), ("250 g", 500)],
    (1840, "piments"): [("1 kg", 2000), ("250 g", 500)],
    (1823, "bananes"): [("1 kg", 800), ("500 g", 400)],
    (1835, "oranges"): [("1 kg", 700), ("500 g", 350)],
    (1843, "pommes fra"): [("1 kg", 1500), ("500 g", 750)],
    (1829, "clémentines"): [("1 kg", 1000), ("500 g", 500)],
    (1828, "citrons verts"): [("1 kg", 1000), ("500 g", 500)],
    (1827, "citrons jaunes"): [("1 kg", 1500), ("500 g", 750)],
    (1836, "pamplemousses"): [("1 kg", 1000), ("500 g", 500)],
    (1822, "avocats"): [("1 kg", 1500), ("500 g", 750)],
    (1819, "ananas frais"): [("Petit", 750), ("Moyen", 1000), ("Gros", 1500)],
    (1837, "pastèque"): [("Petite", 1500), ("Moyenne", 2500), ("Grosse", 3500)],
    (1871, "crème glacée"): [("2 L", 4500), ("1 L", 2500), ("500 ml", 1500)],
    (1872, "crème glacée"): [("2 L", 4500), ("1 L", 2500), ("500 ml", 1500)],
    (1873, "crème glacée"): [("2 L", 4500), ("1 L", 2500), ("500 ml", 1500)],
    (1874, "crème glacée"): [("2 L", 4500), ("1 L", 2500), ("500 ml", 1500)],
    (1876, "cuisses de poulet"): [("Carton 10 kg", 17500), ("1 kg", 2000)],
    (1877, "frites"): [("2,5 kg", 3500), ("1 kg", 1500)],
    (1875, "crevettes"): [("1 kg", 5000), ("500 g", 2600)],
    (1879, "poissons"): [("Carton 10 kg", 15000), ("1 kg", 1700)],
    (1883, "saucisse"): [("1 kg", 2500), ("500 g", 1300)],
    (1885, "viandes"): [("1 kg", 4500), ("500 g", 2300)],
    (1878, "légumes mixes"): [("1 kg", 1500), ("500 g", 800)],
    (1882, "filet de bœuf"): [("1 kg", 6000), ("500 g", 3000)],
    (1853, "savons"): [("Unité", 300), ("Lot de 3", 850)],
    (1849, "dentifrices"): [("75 ml", 800), ("100 ml", 1000)],
    (1850, "déodorants"): [("150 ml", 1500), ("250 ml", 2300)],
    (1851, "gels de douche"): [("250 ml", 1200), ("500 ml", 2000)],
    (1852, "lotions"): [("250 ml", 1500), ("400 ml", 2300)],
    (1854, "shampoings"): [("250 ml", 1200), ("400 ml", 1800)],
    (1855, "vaseline"): [("100 ml", 700), ("250 ml", 1300)],
    (1848, "crème de corps"): [("250 ml", 1500), ("500 ml", 2500)],
}
SUPERMARCHE = 1


def appliquer(apps, schema_editor):
    Product = apps.get_model("catalog", "Product")
    ProductVariant = apps.get_model("catalog", "ProductVariant")
    Category = apps.get_model("catalog", "Category")
    PointOfSale = apps.get_model("stores", "PointOfSale")
    Stock = apps.get_model("stores", "Stock")
    VariantStock = apps.get_model("stores", "VariantStock")

    for (pk, debut), formats in FORMATS.items():
        p = Product.objects.filter(pk=pk).first()
        if not p or not p.name.lower().startswith(debut) or ProductVariant.objects.filter(product=p).exists():
            continue
        for i, (label, prix) in enumerate(formats):
            ProductVariant.objects.create(product=p, label=label, price=Decimal(prix), order=i, is_active=False)

    # coquille : "5OKG" (lettre O) -> "50 kg"
    ProductVariant.objects.filter(product_id=1867, label="5OKG").update(label="50 kg")

    # Huile d'olive : nouveau produit, format 1 L a 4 500 FCFA (prix valide par l'admin)
    store = PointOfSale.objects.filter(pk=SUPERMARCHE, slug="supermarche").first()
    if store and not Product.objects.filter(sku="SUPERM-HUILE-OLIVE").exists():
        cat = Category.objects.filter(name="Famille huiles").first()
        p = Product.objects.create(sku="SUPERM-HUILE-OLIVE", name="Huile d'olive", slug="huile-d-olive-supermarche", price=Decimal("4500"), category=cat, unit="unite", is_active=True)
        Stock.objects.get_or_create(product=p, point_of_sale=store, defaults={"quantity": 0, "track_stock": False})
        v = ProductVariant.objects.create(product=p, label="1 L", price=Decimal("4500"), order=0, is_active=True)
        VariantStock.objects.get_or_create(variant=v, point_of_sale=store)
        StoreCategory = apps.get_model("stores", "StoreCategory")
        if cat:
            StoreCategory.objects.get_or_create(point_of_sale=store, category=cat)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [("catalog", "0020_fanta_1l5_800"), ("stores", "0051_stockmovement_variant_variantstock")]
    operations = [migrations.RunPython(appliquer, noop)]
