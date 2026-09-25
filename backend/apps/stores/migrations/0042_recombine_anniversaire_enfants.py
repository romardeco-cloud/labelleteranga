import os

from django.core.files.base import ContentFile
from django.db import migrations

ASSET = os.path.join(os.path.dirname(__file__), "..", "migration_assets", "combo_poster_anniv_enfants_v2.jpg")

# Recompose entierement le visuel de "Combo Anniversaire Enfants" a partir des 3 affiches individuelles
# fournies par l'utilisateur (Fatayas, Pizza au Poulet, Nos Jus Naturels) : photo principale = fatayas,
# coin haut-droit = pizza, coin bas-droit = les 3 jus. Corrige aussi un bug de la migration 0041 : le
# titre (le plus long des 10 combos) chevauchait le rond du prix ; le nouveau montage limite la largeur
# du titre pour laisser la place au prix.


def appliquer(apps, schema_editor):
    Combo = apps.get_model("stores", "Combo")
    PointOfSale = apps.get_model("stores", "PointOfSale")

    store = PointOfSale.objects.filter(slug="resto").first()
    if not store:
        return

    combo = Combo.objects.filter(point_of_sale=store, name="Combo Anniversaire Enfants").first()
    if not combo:
        return

    with open(ASSET, "rb") as f:
        data = f.read()
    combo.image.save("combo_poster_anniv_enfants_v2.jpg", ContentFile(data), save=True)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("stores", "0041_affiche_complete_des_combos"),
    ]

    operations = [
        migrations.RunPython(appliquer, noop),
    ]
