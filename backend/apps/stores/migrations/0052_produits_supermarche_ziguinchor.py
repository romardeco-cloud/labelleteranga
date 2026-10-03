from django.db import migrations

# Demande de l'admin (03/10/2026) : le Supermarche de Ziguinchor vend les memes produits que celui de Mbour-Saly,
# aux memes prix (produits partages : prix, formats et photos communs), avec son propre stock (non suivi, comme a
# Mbour-Saly). Les rayons (categories du point de vente) sont copies avec leur ordre et leur nom affiche.
SOURCE, CIBLE = (1, "supermarche"), (7, "supermarche-la-belle-teranga-ziguinchor")


def appliquer(apps, schema_editor):
    PointOfSale = apps.get_model("stores", "PointOfSale")
    Stock = apps.get_model("stores", "Stock")
    StoreCategory = apps.get_model("stores", "StoreCategory")
    if not (PointOfSale.objects.filter(pk=SOURCE[0], slug=SOURCE[1]).exists() and PointOfSale.objects.filter(pk=CIBLE[0], slug=CIBLE[1]).exists()):
        return
    for s in Stock.objects.filter(point_of_sale_id=SOURCE[0], product__is_active=True):
        Stock.objects.get_or_create(product_id=s.product_id, point_of_sale_id=CIBLE[0], defaults={"quantity": 0, "track_stock": False})
    for l in StoreCategory.objects.filter(point_of_sale_id=SOURCE[0]):
        StoreCategory.objects.get_or_create(point_of_sale_id=CIBLE[0], category_id=l.category_id, defaults={"order": l.order, "display_name": l.display_name})


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [("stores", "0051_stockmovement_variant_variantstock"), ("catalog", "0030_masque_doublons_renommes")]
    operations = [migrations.RunPython(appliquer, noop)]
