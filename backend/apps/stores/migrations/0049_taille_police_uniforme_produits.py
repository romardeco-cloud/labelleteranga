import os

from django.core.files.base import ContentFile
from django.db import migrations

ASSET_DIR = os.path.join(os.path.dirname(__file__), "..", "migration_assets")

# Les 9 affiches individuelles (migration 0048) avaient chacune une taille de titre differente (heritee
# des visuels fournis par l'utilisateur). Cette migration redessine uniquement le titre de chaque affiche
# a une taille uniforme (proportionnelle a la largeur de l'image, ~7.5%), en conservant photo, description,
# puces et pied de page inchanges. Montage PIL : la zone du titre est effacee avec la couleur de fond locale
# puis retracee avec Georgia Bold, en reprenant la couleur (dorée/creme) mesuree sur le titre d'origine.
PRODUCT_FILES = {
    227: "product_etodjey_v2.jpg",
    1140: "product_plateau_fatayas_v2.jpg",
    1058: "product_jus_bissap_v2.jpg",
    1059: "product_jus_bouille_v2.jpg",
    1146: "product_poisson_frit_v2.jpg",
    1143: "product_frites_maison_v2.jpg",
    1147: "product_thiep_au_poulet_v2.jpg",
    341: "product_fataya_complet_v2.jpg",
    1057: "product_jus_gingembre_v2.jpg",
}


def appliquer(apps, schema_editor):
    Product = apps.get_model("catalog", "Product")

    for pk, filename in PRODUCT_FILES.items():
        product = Product.objects.filter(pk=pk).first()
        if not product:
            continue
        with open(os.path.join(ASSET_DIR, filename), "rb") as f:
            data = f.read()
        product.image.save(filename, ContentFile(data), save=True)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("stores", "0048_affiches_produits_individuels"),
    ]

    operations = [
        migrations.RunPython(appliquer, noop),
    ]
