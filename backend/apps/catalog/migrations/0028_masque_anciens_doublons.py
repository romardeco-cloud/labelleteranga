from django.db import migrations

# Demande de l'admin (03/10/2026) : masquer les anciens produits du Supermarche remplaces par les nouveaux du 03/10
# (Nido -> Lait en poudre nido, Lait lecran -> Lait en poudre laicran, Farine de ble qualite superieure -> Farine de
# ble, Huile d'olive -> Huile d'olive extra vierge). Masques seulement : ventes passees et photos conservees.
ANCIENS = {1866: "nido", 1864: "lait lecran", 1861: "farine de blé, qualité", 1886: "huile d'olive"}


def appliquer(apps, schema_editor):
    Product = apps.get_model("catalog", "Product")
    for pk, debut in ANCIENS.items():
        p = Product.objects.filter(pk=pk).first()
        if p and p.name.lower().startswith(debut):
            p.is_active = False
            p.save(update_fields=["is_active"])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [("catalog", "0027_canette_250")]
    operations = [migrations.RunPython(appliquer, noop)]
