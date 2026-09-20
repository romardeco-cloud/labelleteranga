from django.db import migrations

# (nom, occasion, description, contenu (une ligne par element), pour combien de personnes, week-end seulement, delai de reservation en heures)
COMBOS = [
    ("Combo Duo Pizza", "Repas à deux", "Une pizza à partager et deux boissons fraîches.", "1 pizza moyenne (30 cm) au choix\n2 boissons (33 cl)", "2 personnes", False, 2),
    ("Combo Burger", "Déjeuner", "Le classique du fast-food : burger, frites et boisson.", "1 burger au choix\n1 portion de frites\n1 boisson (33 cl)", "1 personne", False, 1),
    ("Combo Poulet braisé", "Repas en famille", "Poulet braisé entier servi avec ses accompagnements.", "1 poulet braisé entier\n1 grande portion de frites\nSauces maison\n4 boissons (33 cl)", "4 personnes", False, 4),
    ("Combo Famille Pizza", "Repas en famille", "Deux grandes pizzas, des frites et des boissons pour toute la famille.", "2 pizzas grandes (35 cm) au choix\n1 grande portion de frites\n4 boissons (33 cl)", "4 à 5 personnes", False, 3),
    ("Combo Pizza Party", "Anniversaire", "Le pack idéal pour un anniversaire ou une réunion : pizzas familiales, frites et boissons.", "4 pizzas familiales (40 cm) au choix\n2 grandes portions de frites\n8 boissons (33 cl)", "10 à 12 personnes", False, 24),
    ("Combo Anniversaire Enfants", "Anniversaire", "Un goûter salé que les enfants adorent.", "20 fatayas et pastels\n2 pizzas moyennes (30 cm)\n1 grande portion de frites\n10 jus (20 cl)", "8 à 10 enfants", False, 24),
    ("Combo Soirée entre amis", "Soirée entre amis", "Un plateau à partager pour une soirée réussie.", "Plateau de 30 fatayas et pastels\n2 pizzas grandes (35 cm)\n1 grande portion de frites\n6 boissons (33 cl)", "6 à 8 personnes", False, 24),
    ("Combo Week-end Yassa", "Week-end en famille", "Le déjeuner du samedi ou du dimanche, à la sénégalaise.", "Plat familial de yassa poulet avec riz\n1 salade\n4 boissons (33 cl)", "4 à 5 personnes", True, 24),
    ("Combo Thiéboudienne", "Repas en famille", "Le plat national, servi pour toute la famille.", "Plat familial de thiéboudienne\n1 salade\n4 boissons (33 cl)", "4 à 5 personnes", False, 24),
    ("Combo Box Sénégalaise", "Déjeuner", "La box complète : riz, poulet braisé, frites et sauce maison.", "1 box sénégalaise\n1 boisson (33 cl)", "1 personne", False, 1),
]


def create_combos(apps, schema_editor):
    """Combos du restaurant, prets a etre completes (prix a saisir) : ils restent inactifs tant que le prix n'est pas fixe."""
    PointOfSale = apps.get_model("stores", "PointOfSale")
    Combo = apps.get_model("stores", "Combo")
    for store in PointOfSale.objects.filter(slug="resto"):
        for order, (name, occasion, description, includes, serves, weekend_only, notice) in enumerate(COMBOS):
            Combo.objects.get_or_create(
                point_of_sale=store,
                name=name,
                defaults={
                    "occasion": occasion,
                    "description": description,
                    "includes": includes,
                    "serves": serves,
                    "weekend_only": weekend_only,
                    "min_notice_hours": notice,
                    "price": 0,
                    "is_active": False,
                    "order": order,
                },
            )


class Migration(migrations.Migration):

    dependencies = [
        ("stores", "0028_cachet_options_par_defaut"),
    ]

    operations = [
        migrations.RunPython(create_combos, migrations.RunPython.noop),
    ]
