import os

from django.core.files.base import ContentFile
from django.db import migrations

ASSET_DIR = os.path.join(os.path.dirname(__file__), "..", "migration_assets")

# Pour chaque combo : meme carte qu'avant (photo principale, titre, description inchanges), seules les
# cases "fruits" et/ou "jus" (coin haut-droit / bas-droit) sont remplacees : "fruits" -> photo frites
# maison, "jus" -> bande des 3 jus naturels (gingembre, bissap, bouille). Montage fait avec PIL a partir
# des visuels envoyes par l'utilisateur, en reproduisant exactement la geometrie des cartes existantes
# (coins arrondis, memes coordonnees) pour que le remplacement soit invisible a l'oeil.
COMBO_FILES = {
    "Combo Duo Pizza": "combo_recompose_duo_pizza.jpg",
    "Combo Burger": "combo_recompose_burger.jpg",
    "Combo Poulet braisé": "combo_recompose_poulet_braise.jpg",
    "Combo Anniversaire Enfants": "combo_recompose_anniv_enfants.jpg",
    "Combo Week-end Yassa": "combo_recompose_weekend_yassa.jpg",
    "Combo Thiéboudienne": "combo_recompose_thieboudienne.jpg",
    "Combo Famille Pizza": "combo_recompose_famille_pizza.jpg",
    "Combo Soirée entre amis": "combo_recompose_soiree_amis.jpg",
    "Combo Box Sénégalaise": "combo_recompose_box_senegalaise.jpg",
}


def recomposer(apps, schema_editor):
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
        ("stores", "0039_annule_remplacement_photo_fataya"),
    ]

    operations = [
        migrations.RunPython(recomposer, noop),
    ]
