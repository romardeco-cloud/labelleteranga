from django.db import migrations


def deplacer(apps, schema_editor):
    """
    Demande de l'admin (02/10/2026) : au Resto tout est cuit. "Poulet entier" (RESTO-019) etait range dans "Surgeles",
    qui apparaissait donc a tort dans les categories du Resto : on le range dans "Poulet et grillades". Rien n'est
    modifie si le produit ou les categories ne correspondent plus a ceux constates.
    """
    Category = apps.get_model("catalog", "Category")
    Product = apps.get_model("catalog", "Product")
    grillades = Category.objects.filter(pk=51, name="Poulet et grillades").first()
    if grillades:
        Product.objects.filter(pk=233, sku="RESTO-019", category_id=15).update(category=grillades)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [("catalog", "0012_supprime_categories_inutilisees")]
    operations = [migrations.RunPython(deplacer, noop)]
