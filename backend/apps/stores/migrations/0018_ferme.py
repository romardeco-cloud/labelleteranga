from django.db import migrations

NAME = "Ferme La Belle Teranga"
COPIED = [
    "timezone", "email", "legal_form", "share_capital", "ninea", "rccm", "vat_rate", "prices_include_vat", "payment_methods",
    "receipt_slogan", "receipt_footer", "module_hold", "module_history", "module_qr", "module_dine_in", "module_customer_orders",
    "module_drawer", "module_xreport", "loyalty_mode", "loyalty_threshold", "loyalty_min_order", "loyalty_reward_type",
    "loyalty_reward_value", "loyalty_reward_label", "loyalty_valid_days",
]


def create_farm(apps, schema_editor):
    """Ajoute la ferme avec la meme configuration que les autres points de vente (infos legales, paiements, ticket, site web...)."""
    PointOfSale = apps.get_model("stores", "PointOfSale")
    StoreSettings = apps.get_model("stores", "StoreSettings")
    if PointOfSale.objects.filter(slug="ferme").exists() or PointOfSale.objects.filter(name=NAME).exists():
        return
    ref = PointOfSale.objects.exclude(settings__rccm="").order_by("id").first() or PointOfSale.objects.order_by("id").first()
    store = PointOfSale.objects.create(
        name=NAME,
        slug="ferme",
        online_enabled=True,
        description="Les produits de la ferme La Belle Teranga : commandez en ligne, livraison ou retrait.",
    )
    st = StoreSettings(point_of_sale=store)
    if ref:
        ref_st = StoreSettings.objects.filter(point_of_sale=ref).first()
        if ref_st:
            for f in COPIED:
                setattr(st, f, getattr(ref_st, f))
            st.social_links = {k: v for k, v in (ref_st.social_links or {}).items() if k != "website"}
    st.rccm = st.rccm or "SN ZGR 2023 A 2946"
    st.ninea = st.ninea or "010903103 1P1"
    links = dict(st.social_links or {})
    links["website"] = "https://ferme.labelleteranga.com"
    st.social_links = links
    st.save()


class Migration(migrations.Migration):
    dependencies = [("stores", "0017_legal_info_and_websites")]
    operations = [migrations.RunPython(create_farm, migrations.RunPython.noop)]
