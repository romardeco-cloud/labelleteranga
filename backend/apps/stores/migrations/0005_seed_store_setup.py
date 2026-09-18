from django.db import migrations
from django.utils.text import slugify

# Categories par point de vente, dans l'ordre d'affichage voulu (visuels fournis par le client).
RESTO = ["FAST FOOD", "PIZZA", "PÂTISSERIE", "LIVRAISON", "BOISSONS FRAICHES", "REPAS MIDI", "DESSERT", "BOISSONS CHAUDES"]
SUPERMARCHE = [
    "FRUITS & LEGUMES", "CHARCUTERIE", "FROMAGERIE", "PÂTISSERIE", "GÂTEAU", "PRODUITS SECS",
    "PRODUITS LAITIERS", "PRODUITS LIQUIDES", "PRODUITS D'HYGIÈNES", "PAPETERIES", "PRODUITS DE BÉBÉ",
]
# Parametres exacts de la page "Parametres" du restaurant (capture du client)
RESTO_SETTINGS = {
    "address": "BOUCOTTE CENTRE À COTE DE LA RADIO ZIG FM ZIGUINCHOR, ZIGUINCHOR",
    "phone": "+221777688850",
    "legal_form": "EI",
    "share_capital": 1000000,
    "timezone": "Africa/Dakar",
}


def seed(apps, schema_editor):
    PointOfSale = apps.get_model("stores", "PointOfSale")
    StoreCategory = apps.get_model("stores", "StoreCategory")
    StoreSettings = apps.get_model("stores", "StoreSettings")
    Category = apps.get_model("catalog", "Category")

    for store in PointOfSale.objects.all():
        StoreSettings.objects.get_or_create(point_of_sale=store)

    def link(store, names):
        for order, name in enumerate(names):
            cat, _ = Category.objects.get_or_create(name=name, defaults={"slug": slugify(name)})
            StoreCategory.objects.get_or_create(point_of_sale=store, category=cat, defaults={"order": order})

    resto = PointOfSale.objects.filter(name__istartswith="Resto").first()
    if resto:
        link(resto, RESTO)
        if not resto.address:
            resto.address = RESTO_SETTINGS["address"]
        if not resto.phone:
            resto.phone = RESTO_SETTINGS["phone"]
        resto.save()
        st = StoreSettings.objects.get(point_of_sale=resto)
        st.legal_form = st.legal_form or RESTO_SETTINGS["legal_form"]
        st.share_capital = st.share_capital or RESTO_SETTINGS["share_capital"]
        st.timezone = RESTO_SETTINGS["timezone"]
        st.save()

    supermarche = PointOfSale.objects.filter(name__istartswith="Supermarch").first()
    if supermarche:
        link(supermarche, SUPERMARCHE)


class Migration(migrations.Migration):
    dependencies = [
        ("stores", "0004_draweropening_storesettings_storecategory"),
        ("catalog", "0009_restaurant_categories"),
    ]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
