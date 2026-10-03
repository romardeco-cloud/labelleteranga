from django.db import migrations

# Demande de l'admin (03/10/2026) : mettre en vente, aux prix proposes, tous les formats ajoutes hors vente par la
# migration 0021 (produits du Supermarche). Seuls ces formats-la sont concernes (meme produit, meme libelle).


def appliquer(apps, schema_editor):
    import importlib

    m21 = importlib.import_module("apps.catalog.migrations.0021_formats_supermarche_a_valider")
    ProductVariant = apps.get_model("catalog", "ProductVariant")
    for (pk, _debut), formats in m21.FORMATS.items():
        ProductVariant.objects.filter(product_id=pk, label__in=[f[0] for f in formats], is_active=False).update(is_active=True)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [("catalog", "0021_formats_supermarche_a_valider")]
    operations = [migrations.RunPython(appliquer, noop)]
