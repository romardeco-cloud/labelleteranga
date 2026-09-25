import os

from django.core.files.base import ContentFile
from django.db import migrations

ASSET = os.path.join(os.path.dirname(__file__), "..", "migration_assets", "combo_fataya_plateau.jpg")
COMBO_NAMES = ["Combo Anniversaire Enfants", "Combo Soirée entre amis"]


def remplacer_photo(apps, schema_editor):
    Combo = apps.get_model("stores", "Combo")
    PointOfSale = apps.get_model("stores", "PointOfSale")

    store = PointOfSale.objects.filter(slug="resto").first()
    if not store:
        return

    with open(ASSET, "rb") as f:
        data = f.read()

    for name in COMBO_NAMES:
        combo = Combo.objects.filter(point_of_sale=store, name=name).first()
        if combo:
            combo.image.save("plateau-fatayas-pastels.jpg", ContentFile(data), save=True)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("stores", "0037_menu_du_jour_resto_seulement"),
    ]

    operations = [
        migrations.RunPython(remplacer_photo, noop),
    ]
