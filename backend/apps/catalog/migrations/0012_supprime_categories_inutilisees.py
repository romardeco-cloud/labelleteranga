from django.db import migrations

# Demande de l'admin (02/10/2026) : ne garder que les categories du Supermarche (catalogue importe le 02/10), du Resto
# et du Depot d'aliments avicole. Les 38 categories ci-dessous n'avaient aucun produit : restes d'anciens imports (dont
# des categories parasites "10", "177", "Nombre de produits"...), plus "FAST FOOD" et "Poissonnerie" (Resto, vides).
# Identifiant ET nom doivent correspondre : une autre base (developpement) ou les memes numeros designent d'autres
# categories n'est pas touchee.
A_SUPPRIMER = {
    62: "30", 63: "24", 64: "10", 65: "15", 66: "11", 67: "19", 68: "14", 69: "20", 70: "177",
    61: "Nombre de produits",
    3: "FROMAGERIE", 4: "PÂTISSERIE", 5: "GÂTEAU", 7: "PRODUITS LAITIERS", 9: "PRODUITS D'HYGIÈNES", 10: "PAPETERIES",
    11: "PRODUITS DE BÉBÉ", 12: "RESTAURATION", 13: "Boucherie / Volaille", 16: "Produits pour animaux",
    17: "Textile et habillement", 18: "Électroménager", 19: "Quincaillerie et bricolage", 20: "Produits halal / religieux",
    24: "BOISSONS FRAICHES", 25: "REPAS MIDI", 26: "DESSERT", 28: "Fruits et légumes", 29: "Épicerie salée",
    30: "Papeterie et bureau", 31: "Céréales locales", 34: "Épicerie sucrée", 35: "Bébé et puériculture", 60: "Papèterie",
    59: "Produits Surgelés",  # doublon vide de "Surgelés"
    52: "Pizzas",  # vide : les pizzas du Resto sont dans "PIZZA" (affichee "Pizzas" au Resto)
    21: "FAST FOOD", 14: "Poissonnerie",  # Resto, vides
}
PIZZA = (22, "PIZZA")


def supprimer(apps, schema_editor):
    Category = apps.get_model("catalog", "Category")
    Product = apps.get_model("catalog", "Product")
    Promotion = apps.get_model("catalog", "Promotion")
    PromoBand = apps.get_model("stores", "PromoBand")

    cibles = [c.pk for c in Category.objects.filter(pk__in=A_SUPPRIMER) if c.name == A_SUPPRIMER[c.pk]]

    # la bande promo "Pizzas" du Resto pointait vers la categorie vide : on la rattache a la vraie categorie des pizzas
    if 52 in cibles and Category.objects.filter(pk=PIZZA[0], name=PIZZA[1]).exists():
        PromoBand.objects.filter(category_id=52).update(category_id=PIZZA[0])

    # garde-fou : jamais une categorie qui a (de nouveau) des produits ou une promotion
    utilisees = set(Product.objects.filter(category_id__in=cibles).values_list("category_id", flat=True))
    utilisees |= set(Promotion.objects.filter(category_id__in=cibles).values_list("category_id", flat=True))
    Category.objects.filter(pk__in=[pk for pk in cibles if pk not in utilisees]).delete()


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [("catalog", "0011_classer_produits"), ("stores", "0050_companybranding")]
    operations = [migrations.RunPython(supprimer, noop)]
