from django.db import migrations

# Annule 0038 : cette migration avait remplace la carte visuelle complete (titre + 3 photos + description)
# par une simple photo brute, alors que l'utilisateur voulait seulement changer la photo des fatayas a
# l'interieur de cette carte. On restaure les visuels d'origine, toujours presents sur Cloudinary (l'ancien
# public_id n'est jamais supprime lors d'un remplacement, voir config/storage.py).
RESTORE = {
    "Combo Anniversaire Enfants": "combos/combo-anniversaire-enfants_b890c038",
    "Combo Soirée entre amis": "combos/combo-soiree-entre-amis_64db13b3",
}


def restaurer(apps, schema_editor):
    Combo = apps.get_model("stores", "Combo")
    PointOfSale = apps.get_model("stores", "PointOfSale")

    store = PointOfSale.objects.filter(slug="resto").first()
    if not store:
        return

    for name, public_id in RESTORE.items():
        Combo.objects.filter(point_of_sale=store, name=name).update(image=public_id)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("stores", "0038_remplace_photo_fataya_combos"),
    ]

    operations = [
        migrations.RunPython(restaurer, noop),
    ]
