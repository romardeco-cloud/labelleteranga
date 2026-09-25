import os

from django.core.files.base import ContentFile
from django.db import migrations

ASSET_DIR = os.path.join(os.path.dirname(__file__), "..", "migration_assets")

# Les combos "Pizza Party" (27000 -> 28000) et "Week-end Yassa" (7000 -> 8000) ont ete modifies par
# l'utilisateur dans Admin > Combos pendant que leurs affiches etaient en cours de generation : les
# visuels deployes en 0043 affichaient donc encore l'ancien prix. Cette migration remplace les deux
# affiches par une version a jour avec le prix actuel.
COMBO_FILES = {
    "Combo Pizza Party": "combo_poster_pizza_party_v3.jpg",
    "Combo Week-end Yassa": "combo_poster_weekend_yassa_v3.jpg",
}


def appliquer(apps, schema_editor):
    Combo = apps.get_model("stores", "Combo")
    PointOfSale = apps.get_model("stores", "PointOfSale")

    store = PointOfSale.objects.filter(slug="resto").first()
    if not store:
        return

    for name, filename in COMBO_FILES.items():
        combo = Combo.objects.filter(point_of_sale=store, name=name).first()
        if not combo:
            continue
        with open(os.path.join(ASSET_DIR, filename), "rb") as f:
            data = f.read()
        combo.image.save(filename, ContentFile(data), save=True)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("stores", "0046_corrige_retour_prix_pizza_party"),
    ]

    operations = [
        migrations.RunPython(appliquer, noop),
    ]
