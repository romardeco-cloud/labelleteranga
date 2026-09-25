import os

from django.core.files.base import ContentFile
from django.db import migrations

ASSET_DIR = os.path.join(os.path.dirname(__file__), "..", "migration_assets")

# Remplace la photo de 9 produits Resto par leur affiche complete (meme style que les combos : titre,
# description, puces coche, prix, coordonnees), fournie par l'utilisateur. But : le nom du produit reste
# lisible avec une belle police meme si la police du site ne se charge pas correctement chez un visiteur
# (elle est deja dessinee dans l'image, comme pour les combos).
PRODUCT_FILES = {
    227: "product_etodjey.webp",
    1140: "product_plateau_fatayas.jpg",
    1058: "product_jus_bissap.jpg",
    1059: "product_jus_bouille.jpg",
    1146: "product_poisson_frit.webp",
    1143: "product_frites_maison.jpg",
    1147: "product_thiep_au_poulet.jpg",
    341: "product_fataya_complet.jpg",
    1057: "product_jus_gingembre.jpg",
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
        ("stores", "0047_corrige_prix_affiches_pizza_party_yassa"),
        ("catalog", "0011_classer_produits"),
    ]

    operations = [
        migrations.RunPython(appliquer, noop),
    ]
