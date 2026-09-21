import re
import unicodedata

from django.db import migrations
from django.db.models import F


def _norm(text):
    return re.sub(r"[^a-z0-9]+", "", unicodedata.normalize("NFKD", str(text or "")).encode("ascii", "ignore").decode().lower())


def apply(apps, schema_editor):
    """Bande « Nos Plats Senegalais » (categorie Plats senegalais) placee en premier sur le site du resto, a la place de la bande des combos (desactivee, pas supprimee)."""
    PointOfSale = apps.get_model("stores", "PointOfSale")
    PromoBand = apps.get_model("stores", "PromoBand")
    Category = apps.get_model("catalog", "Category")
    category = next((c for c in Category.objects.all() if _norm(c.name) == _norm("Plats sénégalais")), None)
    for store in PointOfSale.objects.filter(slug="resto"):
        PromoBand.objects.filter(point_of_sale=store, title="Nos Combos").update(is_active=False)
        band, created = PromoBand.objects.get_or_create(
            point_of_sale=store,
            title="Nos Plats Sénégalais",
            defaults={
                "text": "Thiéboudienne, yassa, mafé, domoda, étodjey… le goût de chez nous, préparé avec soin et servi chaud.",
                "category": category,
                "include_combos": False,
                "is_active": True,
                "show_prices": True,
            },
        )
        # premiere position ; les autres bandes suivent
        PromoBand.objects.filter(point_of_sale=store).exclude(pk=band.pk).update(order=F("order") + 1)
        band.order = 0
        band.save(update_fields=["order"])


class Migration(migrations.Migration):

    dependencies = [
        ("stores", "0034_bandes_de_pub_resto"),
        ("catalog", "0011_classer_produits"),
    ]

    operations = [migrations.RunPython(apply, migrations.RunPython.noop)]
