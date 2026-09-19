from decimal import Decimal

from django.db import migrations

# Prix du restaurant avant l'application, par erreur, d'un prix uniforme (10 000 FCFA) a tous les produits.
PRICES = {
    "RESTO-001": 500,    # LIVRAISON
    "RESTO-002": 2000, "RESTO-003": 2500, "RESTO-004": 1500, "RESTO-005": 1000, "RESTO-006": 100,
    "RESTO-007": 1500, "RESTO-008": 2000, "RESTO-009": 1500, "RESTO-010": 2000, "RESTO-011": 2000,
    "RESTO-012": 1000, "RESTO-013": 1500, "RESTO-014": 1000, "RESTO-015": 700, "RESTO-016": 1000,
    "RESTO-017": 15000, "RESTO-018": 20000, "RESTO-019": 6500, "RESTO-020": 4000, "RESTO-021": 200,
    "RESTO-022": 3000, "RESTO-023": 2500, "RESTO-024": 1500, "RESTO-025": 1000, "RESTO-026": 1500,
    "RESTO-027": 1000, "RESTO-028": 1000, "RESTO-029": 1500, "RESTO-030": 1000, "RESTO-031": 1500,
    "RESTO-032": 1500, "RESTO-033": 500, "RESTO-034": 100,
}


def restore(apps, schema_editor):
    """Remet les prix du restaurant, uniquement pour les produits encore a 10 000 (jamais un prix modifie depuis)."""
    try:
        Product = apps.get_model("catalog", "Product")
        for sku, price in PRICES.items():
            Product.objects.filter(sku=sku, price=Decimal("10000")).update(price=Decimal(price))
    except Exception as exc:  # noqa: BLE001
        print(f"[0010_restore_resto_prices] ignore : {exc}")


class Migration(migrations.Migration):
    dependencies = [("catalog", "0009_restaurant_categories")]
    operations = [migrations.RunPython(restore, migrations.RunPython.noop)]
