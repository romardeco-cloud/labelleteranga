from django.db import migrations


def migrate_stock_forward(apps, schema_editor):
    Product = apps.get_model("catalog", "Product")
    PointOfSale = apps.get_model("stores", "PointOfSale")
    Stock = apps.get_model("stores", "Stock")

    if not Product.objects.exists():
        return

    default_pos, _ = PointOfSale.objects.get_or_create(
        name="Boutique principale",
        defaults={"is_active": True},
    )
    for product in Product.objects.all():
        Stock.objects.get_or_create(
            product=product,
            point_of_sale=default_pos,
            defaults={"quantity": product.stock_quantity},
        )


def migrate_stock_backward(apps, schema_editor):
    # Pas de retour arriere automatique : le champ stock_quantity est
    # recree vide par la migration precedente au besoin (unlikely path).
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0001_initial"),
        ("stores", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(migrate_stock_forward, migrate_stock_backward),
    ]
