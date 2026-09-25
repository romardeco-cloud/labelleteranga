import os

from django.core.files.base import ContentFile
from django.db import migrations

ASSET_DIR = os.path.join(os.path.dirname(__file__), "..", "migration_assets")

# A la demande de l'utilisateur, diversifie les photos de 3 combos qui montraient deux fois le meme type
# de plat dans leurs 2 cases secondaires : une case devient "les 3 jus naturels", et pour Pizza Party
# (qui n'avait aucune photo de frites) une case devient aussi "frites maison".
COMBO_FILES = {
    "Combo Famille Pizza": "combo_poster_famille_pizza_v2.jpg",
    "Combo Pizza Party": "combo_poster_pizza_party_v2.jpg",
    "Combo Week-end Yassa": "combo_poster_weekend_yassa_v2.jpg",
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
        ("stores", "0042_recombine_anniversaire_enfants"),
    ]

    operations = [
        migrations.RunPython(appliquer, noop),
    ]
