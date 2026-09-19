from django.db import migrations

NAME = "Ferme La Belle Teranga"
COPIED = [
    "timezone", "email", "legal_form", "share_capital", "ninea", "rccm", "vat_rate", "prices_include_vat", "payment_methods",
    "receipt_slogan", "receipt_footer", "module_hold", "module_history", "module_qr", "module_dine_in", "module_customer_orders",
    "module_drawer", "module_xreport", "loyalty_mode", "loyalty_threshold", "loyalty_min_order", "loyalty_reward_type",
    "loyalty_reward_value", "loyalty_reward_label", "loyalty_valid_days",
]


def configure_farm(apps, schema_editor):
    """
    La ferme recoit la meme configuration que les autres points de vente : identifiant de site, site en ligne, infos legales
    (RCCM / NINEA), moyens de paiement, ticket, modules de caisse, fidelite, adresse web. La cree si elle n'existe pas encore ;
    sinon complete celle deja ajoutee a la main. Ne bloque jamais la mise en ligne en cas de probleme.
    """
    try:
        PointOfSale = apps.get_model("stores", "PointOfSale")
        StoreSettings = apps.get_model("stores", "StoreSettings")
        store = PointOfSale.objects.filter(slug="ferme").first() or PointOfSale.objects.filter(name__iexact=NAME).first()
        if store is None:
            store = PointOfSale.objects.create(
                name=NAME, slug="ferme", online_enabled=True, description="Les produits de la ferme La Belle Teranga : commandez en ligne."
            )
        else:
            if not store.slug and not PointOfSale.objects.filter(slug="ferme").exists():
                store.slug = "ferme"
            if not store.description:
                store.description = "Les produits de la ferme La Belle Teranga : commandez en ligne."
            store.online_enabled = True
            store.save()
        ref = PointOfSale.objects.exclude(pk=store.pk).exclude(settings__rccm="").order_by("id").first()
        st = StoreSettings.objects.filter(point_of_sale=store).first() or StoreSettings(point_of_sale=store)
        ref_st = StoreSettings.objects.filter(point_of_sale=ref).first() if ref else None
        if ref_st and not st.rccm:
            for f in COPIED:
                setattr(st, f, getattr(ref_st, f))
            st.social_links = {k: v for k, v in (ref_st.social_links or {}).items() if k != "website"}
        st.rccm = st.rccm or "SN ZGR 2023 A 2946"
        st.ninea = st.ninea or "010903103 1P1"
        links = dict(st.social_links or {})
        links.setdefault("website", f"https://{store.slug}.labelleteranga.com")
        st.social_links = links
        st.save()
    except Exception as exc:  # noqa: BLE001
        print(f"[0018_ferme] configuration de la ferme ignoree : {exc}")


class Migration(migrations.Migration):
    dependencies = [("stores", "0017_legal_info_and_websites")]
    operations = [migrations.RunPython(configure_farm, migrations.RunPython.noop)]
