from decimal import Decimal

from django.db import migrations

# Demande de l'admin (03/10/2026) : packs de canettes avec des prix provisoires (fictifs, a ajuster par l'admin) :
# pack 6 aligne sur la canette a 250 F, packs 12 et 24 ajoutes. Sodas et jus du Supermarche.
BOISSONS = [1820, 1824, 1857, 1858, 1860]
PACKS = [("Pack 6 canettes", 1400), ("Pack 12 canettes", 2700), ("Pack 24 canettes", 5200)]


def appliquer(apps, schema_editor):
    ProductVariant = apps.get_model("catalog", "ProductVariant")
    for pk in BOISSONS:
        formats = ProductVariant.objects.filter(product_id=pk)
        if not formats.filter(label="Canette 33 cl").exists():
            continue
        dernier = max(f.order for f in formats)
        for label, prix in PACKS:
            v = formats.filter(label=label).first()
            if v:
                v.price = Decimal(prix)
                v.save(update_fields=["price"])
            else:
                dernier += 1
                ProductVariant.objects.create(product_id=pk, label=label, price=Decimal(prix), order=dernier, is_active=True)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [("catalog", "0028_masque_anciens_doublons")]
    operations = [migrations.RunPython(appliquer, noop)]
