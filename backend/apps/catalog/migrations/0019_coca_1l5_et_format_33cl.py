from decimal import Decimal

from django.db import migrations

# Demande de l'admin (03/10/2026) : Coca-Cola 1,5L a 1 000 FCFA ; nouveau format 0.33L a 200 FCFA pour toutes les
# boissons du Supermarche qui ont des formats.
COCA = 1824
BOISSONS = [1820, 1824, 1856, 1857, 1858, 1859, 1860]


def appliquer(apps, schema_editor):
    ProductVariant = apps.get_model("catalog", "ProductVariant")
    ProductVariant.objects.filter(product_id=COCA, product__name__icontains="coca", label__in=["1,5L", "1.5L"]).update(price=Decimal("1000"))
    for pk in BOISSONS:
        formats = ProductVariant.objects.filter(product_id=pk)
        if not formats.exists() or formats.filter(label__in=["0.33L", "0,33L", "33cl", "33 cl"]).exists():
            continue
        dernier = max(f.order for f in formats)
        ProductVariant.objects.create(product_id=pk, label="0.33L", price=Decimal("200"), order=dernier + 1, is_active=True)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [("catalog", "0018_formats_boissons_comme_casamancaise")]
    operations = [migrations.RunPython(appliquer, noop)]
