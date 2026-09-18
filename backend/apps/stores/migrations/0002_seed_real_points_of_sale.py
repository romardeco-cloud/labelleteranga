from django.db import migrations

REAL_STORE_NAMES = [
    "Supermarche La Belle Teranga",
    "Resto & Fast-food La Belle Teranga",
    "Depot Aliment pour volaille La Belle Teranga",
    "Quincaillerie La Belle Teranga",
    "Service de forage La Belle Teranga",
]


def seed_forward(apps, schema_editor):
    PointOfSale = apps.get_model("stores", "PointOfSale")

    # le magasin par defaut cree par la migration de donnees catalog
    # (0002_migrate_stock_to_default_pos) s'appelle "Boutique principale" :
    # on le renomme pour conserver le stock qui lui est deja rattache.
    default_store = PointOfSale.objects.filter(name="Boutique principale").first()
    if default_store:
        default_store.name = REAL_STORE_NAMES[0]
        default_store.save()

    for name in REAL_STORE_NAMES:
        PointOfSale.objects.get_or_create(name=name)


def seed_backward(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("stores", "0001_initial"),
        ("catalog", "0002_migrate_stock_to_default_pos"),
    ]

    operations = [
        migrations.RunPython(seed_forward, seed_backward),
    ]
