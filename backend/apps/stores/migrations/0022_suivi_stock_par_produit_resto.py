from django.db import migrations


def enable_product_level(apps, schema_editor):
    """
    Restaurant et forage : le suivi du stock peut maintenant se choisir produit par produit, comme au supermarche.
    Le reglage global est reactive, et tous les produits existants restent « non suivis » (aucun changement de comportement)
    jusqu'a ce que vous en activez le suivi un par un.
    """
    try:
        PointOfSale = apps.get_model("stores", "PointOfSale")
        StoreSettings = apps.get_model("stores", "StoreSettings")
        Stock = apps.get_model("stores", "Stock")
        for store in PointOfSale.objects.filter(slug__in=["resto", "forage"]):
            settings = StoreSettings.objects.filter(point_of_sale=store).first()
            if settings and not settings.track_stock:
                Stock.objects.filter(point_of_sale=store).update(track_stock=False)
                settings.track_stock = True
                settings.save(update_fields=["track_stock"])
    except Exception as exc:  # noqa: BLE001
        print(f"[0022] ignore : {exc}")


class Migration(migrations.Migration):
    dependencies = [("stores", "0021_livraison_sans_suivi")]
    operations = [migrations.RunPython(enable_product_level, migrations.RunPython.noop)]
