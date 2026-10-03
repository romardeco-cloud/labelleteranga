from django.db import migrations

# Demande de l'admin (03/10/2026) : masquer aussi les 3 anciens doublons renommes entre-temps (Lait Nido, Lait laicran,
# Farine ADJA), remplaces par les nouveaux produits a formats. Masques seulement.
ANCIENS = {1866: "Lait Nido", 1864: "Lait laicran", 1861: "Farine ADJA"}


def appliquer(apps, schema_editor):
    Product = apps.get_model("catalog", "Product")
    for pk, nom in ANCIENS.items():
        Product.objects.filter(pk=pk, name__iexact=nom).update(is_active=False)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [("catalog", "0029_packs_canettes")]
    operations = [migrations.RunPython(appliquer, noop)]
