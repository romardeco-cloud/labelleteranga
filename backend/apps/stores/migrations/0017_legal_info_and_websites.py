from django.db import migrations

RCCM = "SN ZGR 2023 A 2946"
NINEA = "010903103 1P1"
MAIN = "https://labelleteranga.com"
WEBSITES = {
    "resto": "https://resto.labelleteranga.com",
    "supermarche": "https://supermarche.labelleteranga.com",
    "quincaillerie": "https://quincaillerie.labelleteranga.com",
    "depot": "https://depot.labelleteranga.com",
}


def apply(apps, schema_editor):
    """RCCM / NINEA sur tous les points de vente ; site web de chaque point de vente (site principal par defaut)."""
    PointOfSale = apps.get_model("stores", "PointOfSale")
    StoreSettings = apps.get_model("stores", "StoreSettings")
    for store in PointOfSale.objects.all():
        st, _ = StoreSettings.objects.get_or_create(point_of_sale=store)
        st.rccm = RCCM
        st.ninea = NINEA
        links = dict(st.social_links or {})
        links.setdefault("website", WEBSITES.get(store.slug, MAIN))
        st.social_links = links
        st.save(update_fields=["rccm", "ninea", "social_links"])


class Migration(migrations.Migration):
    dependencies = [("stores", "0016_review_comment_hidden")]
    operations = [migrations.RunPython(apply, migrations.RunPython.noop)]
