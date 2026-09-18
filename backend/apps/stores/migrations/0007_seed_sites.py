from django.db import migrations

CONTACT_EMAIL = "info@labelleteranga.com"  # adresse unique pour tous les points de vente

# nom (debut) -> (slug, site en ligne ?, description)
SITES = [
    ("Supermarch", "supermarche", True, "Vos courses du quotidien, livrees chez vous ou a retirer en magasin."),
    ("Resto", "resto", True, "Fast-food et plats du jour : commandez en ligne, livraison ou a emporter."),
    ("Quincaillerie", "quincaillerie", True, "Materiaux, outillage et equipement pour vos travaux."),
    ("Depot", "depot", True, "Aliments pour volaille et elevage."),
    ("Service de forage", "forage", False, "Forage et equipement hydraulique."),
]


def seed(apps, schema_editor):
    PointOfSale = apps.get_model("stores", "PointOfSale")
    StoreSettings = apps.get_model("stores", "StoreSettings")
    for prefix, slug, online, description in SITES:
        store = PointOfSale.objects.filter(name__istartswith=prefix).first()
        if not store:
            continue
        store.slug = store.slug or slug
        store.online_enabled = online
        store.description = store.description or description
        store.save()
    for store in PointOfSale.objects.all():
        st, _ = StoreSettings.objects.get_or_create(point_of_sale=store)
        if not st.email:
            st.email = CONTACT_EMAIL
            st.save()


class Migration(migrations.Migration):
    dependencies = [("stores", "0006_pointofsale_description_pointofsale_online_enabled_and_more")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
