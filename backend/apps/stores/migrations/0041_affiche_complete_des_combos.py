import os

from django.core.files.base import ContentFile
from django.db import migrations

ASSET_DIR = os.path.join(os.path.dirname(__file__), "..", "migration_assets")

# Remplace la photo de chaque combo par une affiche complete : meme haut de carte (photo principale +
# 2 photos, badge "Pour X personnes", titre) suivi d'un bandeau rouge avec le nom du combo, le prix dans
# un rond dore, la liste "includes" avec puces coche, et le bandeau de coordonnees en bas. Montage fait
# avec PIL a partir du modele fourni par l'utilisateur (couleurs reprises de la charte du site :
# frontend/tailwind.config.ts brand.dark/brand.accent, et #f5b942 deja utilise pour les prix).
COMBO_FILES = {
    "Combo Duo Pizza": "combo_poster_duo_pizza.jpg",
    "Combo Burger": "combo_poster_burger.jpg",
    "Combo Poulet braisé": "combo_poster_poulet_braise.jpg",
    "Combo Famille Pizza": "combo_poster_famille_pizza.jpg",
    "Combo Pizza Party": "combo_poster_pizza_party.jpg",
    "Combo Anniversaire Enfants": "combo_poster_anniv_enfants.jpg",
    "Combo Soirée entre amis": "combo_poster_soiree_amis.jpg",
    "Combo Week-end Yassa": "combo_poster_weekend_yassa.jpg",
    "Combo Thiéboudienne": "combo_poster_thieboudienne.jpg",
    "Combo Box Sénégalaise": "combo_poster_box_senegalaise.jpg",
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
        ("stores", "0040_recompose_photos_frites_et_jus"),
    ]

    operations = [
        migrations.RunPython(appliquer, noop),
    ]
