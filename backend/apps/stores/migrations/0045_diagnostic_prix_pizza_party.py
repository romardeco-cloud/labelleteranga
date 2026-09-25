from django.db import migrations


def corriger(apps, schema_editor):
    Product = apps.get_model("catalog", "Product")
    Product.objects.filter(pk=1065).update(price=27000)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("stores", "0044_synchronise_prix_combos_produits"),
    ]

    operations = [
        migrations.RunPython(corriger, noop),
    ]
