from django.db import migrations


def untrack_delivery(apps, schema_editor):
    """Les frais de livraison ne se suivent pas en stock."""
    try:
        Stock = apps.get_model("stores", "Stock")
        Stock.objects.filter(product__sku="RESTO-001", product__name__iexact="LIVRAISON").update(track_stock=False)
    except Exception as exc:  # noqa: BLE001
        print(f"[0021] ignore : {exc}")


class Migration(migrations.Migration):
    dependencies = [("stores", "0020_stock_track_flag")]
    operations = [migrations.RunPython(untrack_delivery, migrations.RunPython.noop)]
