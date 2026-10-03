from django.db import migrations

# Emplacement du prix deja dessine sur 48 affiches du Resto (medaillon dore), releve automatiquement puis verifie a
# l'oeil le 03/10/2026. Le site recouvre ce medaillon avec le prix actuel : modifier le prix dans l'admin suffit.
# Garde-fou : uniquement si la photo est toujours celle qui a ete analysee et qu'aucune zone n'est deja definie.
ZONES = {
    216: ('products/RESTO-002_96a12233', {"x": 0.8188, "y": 0.478, "w": 0.1217, "h": 0.056, "bg": "#deb25b", "fg": "#6c1904", "contenu": "prix", "forme": "ovale"}),
    217: ('products/RESTO-003_eec84d23', {"x": 0.8199, "y": 0.478, "w": 0.1196, "h": 0.056, "bg": "#deb25b", "fg": "#6b1902", "contenu": "prix", "forme": "ovale"}),
    218: ('products/RESTO-004_9247af9d', {"x": 0.8223, "y": 0.478, "w": 0.1146, "h": 0.056, "bg": "#deb25b", "fg": "#6b1904", "contenu": "prix", "forme": "ovale"}),
    219: ('products/RESTO-005_c005753a', {"x": 0.8211, "y": 0.478, "w": 0.118, "h": 0.056, "bg": "#deb25b", "fg": "#6c1807", "contenu": "prix", "forme": "ovale"}),
    220: ('products/RESTO-006_6a79c335', {"x": 0.8399, "y": 0.478, "w": 0.0794, "h": 0.056, "bg": "#deb25b", "fg": "#6c1905", "contenu": "prix", "forme": "ovale"}),
    221: ('products/RESTO-007_836a8e31', {"x": 0.8223, "y": 0.478, "w": 0.1146, "h": 0.056, "bg": "#deb25b", "fg": "#6b1904", "contenu": "prix", "forme": "ovale"}),
    222: ('products/RESTO-008_7d6b5c51', {"x": 0.8188, "y": 0.478, "w": 0.1217, "h": 0.056, "bg": "#deb25b", "fg": "#6c1904", "contenu": "prix", "forme": "ovale"}),
    223: ('products/RESTO-009_dd77fa7f', {"x": 0.8223, "y": 0.478, "w": 0.1147, "h": 0.056, "bg": "#deb25b", "fg": "#6b1804", "contenu": "prix", "forme": "ovale"}),
    224: ('products/RESTO-010_6ab72b53', {"x": 0.8188, "y": 0.478, "w": 0.1217, "h": 0.056, "bg": "#deb25b", "fg": "#6b1705", "contenu": "prix", "forme": "ovale"}),
    225: ('products/RESTO-011_10892f02', {"x": 0.8188, "y": 0.478, "w": 0.1217, "h": 0.056, "bg": "#deb25b", "fg": "#6c1904", "contenu": "prix", "forme": "ovale"}),
    226: ('products/RESTO-012_d4d85b57', {"x": 0.821, "y": 0.478, "w": 0.1181, "h": 0.056, "bg": "#deb25b", "fg": "#6b1904", "contenu": "prix", "forme": "ovale"}),
    227: ('products/product_etodjey_v2_e12f32e9', {"x": 0.8118, "y": 0.4561, "w": 0.1308, "h": 0.0829, "bg": "#f7d485", "fg": "#5a1010", "contenu": "prix", "forme": "ovale"}),
    229: ('products/RESTO-015_5f6089c8', {"x": 0.8379, "y": 0.478, "w": 0.0826, "h": 0.056, "bg": "#deb25b", "fg": "#6b1905", "contenu": "prix", "forme": "ovale"}),
    230: ('products/RESTO-016_906a1663', {"x": 0.8209, "y": 0.478, "w": 0.1183, "h": 0.056, "bg": "#deb25b", "fg": "#6c1904", "contenu": "prix", "forme": "ovale"}),
    231: ('products/RESTO-017_aa7cf416', {"x": 0.8179, "y": 0.478, "w": 0.1206, "h": 0.056, "bg": "#deb25b", "fg": "#6b1905", "contenu": "prix", "forme": "ovale"}),
    232: ('products/RESTO-018_740f2b0c', {"x": 0.8188, "y": 0.478, "w": 0.1217, "h": 0.056, "bg": "#deb25b", "fg": "#6b1903", "contenu": "prix", "forme": "ovale"}),
    235: ('products/RESTO-021_138eae84', {"x": 0.837, "y": 0.478, "w": 0.0855, "h": 0.056, "bg": "#deb25b", "fg": "#6b1a03", "contenu": "prix", "forme": "ovale"}),
    236: ('products/RESTO-022_324b134e', {"x": 0.8185, "y": 0.478, "w": 0.122, "h": 0.056, "bg": "#deb25b", "fg": "#6c1904", "contenu": "prix", "forme": "ovale"}),
    237: ('products/RESTO-023_9d4b57a7', {"x": 0.8199, "y": 0.478, "w": 0.1196, "h": 0.056, "bg": "#deb25b", "fg": "#6b1902", "contenu": "prix", "forme": "ovale"}),
    238: ('products/RESTO-024_0ab690e3', {"x": 0.8223, "y": 0.478, "w": 0.1146, "h": 0.056, "bg": "#deb25b", "fg": "#6b1904", "contenu": "prix", "forme": "ovale"}),
    239: ('products/RESTO-025_53402ffe', {"x": 0.8211, "y": 0.478, "w": 0.1181, "h": 0.056, "bg": "#deb25b", "fg": "#6c1904", "contenu": "prix", "forme": "ovale"}),
    240: ('products/RESTO-026_86ed1e8b', {"x": 0.8223, "y": 0.478, "w": 0.1146, "h": 0.056, "bg": "#deb25b", "fg": "#6c1905", "contenu": "prix", "forme": "ovale"}),
    241: ('products/RESTO-027_f9481049', {"x": 0.821, "y": 0.478, "w": 0.1181, "h": 0.056, "bg": "#deb25b", "fg": "#6b1904", "contenu": "prix", "forme": "ovale"}),
    242: ('products/RESTO-028_a5677b78', {"x": 0.8209, "y": 0.478, "w": 0.1183, "h": 0.056, "bg": "#deb25b", "fg": "#6b1805", "contenu": "prix", "forme": "ovale"}),
    243: ('products/RESTO-029_f59e11e0', {"x": 0.8223, "y": 0.478, "w": 0.1146, "h": 0.056, "bg": "#deb25b", "fg": "#6b1904", "contenu": "prix", "forme": "ovale"}),
    244: ('products/RESTO-030_066270af', {"x": 0.8211, "y": 0.478, "w": 0.118, "h": 0.056, "bg": "#deb25b", "fg": "#6c1905", "contenu": "prix", "forme": "ovale"}),
    245: ('products/RESTO-031_1e7257cf', {"x": 0.8223, "y": 0.478, "w": 0.1146, "h": 0.056, "bg": "#deb25b", "fg": "#6b1904", "contenu": "prix", "forme": "ovale"}),
    246: ('products/RESTO-032_6010aae4', {"x": 0.8223, "y": 0.478, "w": 0.1146, "h": 0.056, "bg": "#deb25b", "fg": "#6c1905", "contenu": "prix", "forme": "ovale"}),
    248: ('products/RESTO-034_e2b633a3', {"x": 0.8399, "y": 0.478, "w": 0.0794, "h": 0.056, "bg": "#deb25b", "fg": "#6b1805", "contenu": "prix", "forme": "ovale"}),
    339: ('products/RESTO-0008_88a6eaae', {"x": 0.8189, "y": 0.478, "w": 0.1206, "h": 0.056, "bg": "#deb25b", "fg": "#6b1a02", "contenu": "prix", "forme": "ovale"}),
    341: ('products/product_fataya_complet_v2_7f2a8aee', {"x": 0.8209, "y": 0.478, "w": 0.1183, "h": 0.056, "bg": "#deb15b", "fg": "#6b1904", "contenu": "prix", "forme": "ovale"}),
    1060: ('products/RESTO-0005_8d3f62d4', {"x": 0.8183, "y": 0.6664, "w": 0.1142, "h": 0.0516, "bg": "#f5b941", "fg": "#621a00", "contenu": "prix", "forme": "ovale"}),
    1061: ('products/Combo_Box_Senegalaise_c03921b6', {"x": 0.828, "y": 0.6908, "w": 0.0943, "h": 0.0543, "bg": "#f5b941", "fg": "#651a06", "contenu": "prix", "forme": "ovale"}),
    1062: ('products/Combo_Burger_6872783a', {"x": 0.828, "y": 0.6908, "w": 0.0943, "h": 0.0543, "bg": "#f5b941", "fg": "#651a06", "contenu": "prix", "forme": "ovale"}),
    1063: ('products/Combo_Duo_Pizza_1eb75e04', {"x": 0.8279, "y": 0.719, "w": 0.0943, "h": 0.0553, "bg": "#f5b941", "fg": "#651b06", "contenu": "prix", "forme": "ovale"}),
    1064: ('products/RESTO-0019_5b724fc1', {"x": 0.8193, "y": 0.6913, "w": 0.1132, "h": 0.0533, "bg": "#f5b941", "fg": "#621905", "contenu": "prix", "forme": "ovale"}),
    1065: ('products/RESTO-0020_6c320943', {"x": 0.8174, "y": 0.6913, "w": 0.1152, "h": 0.0533, "bg": "#f5b941", "fg": "#611a00", "contenu": "prix", "forme": "ovale"}),
    1066: ('products/Combo_Poulet_braise_99260242', {"x": 0.8188, "y": 0.6651, "w": 0.1135, "h": 0.0514, "bg": "#f5b941", "fg": "#641a06", "contenu": "prix", "forme": "ovale"}),
    1067: ('products/Combo_Soiree_entre_amis_daa30654', {"x": 0.8178, "y": 0.6651, "w": 0.1146, "h": 0.0514, "bg": "#f5b941", "fg": "#641b05", "contenu": "prix", "forme": "ovale"}),
    1068: ('products/Combo_Thieboudienne_5c65a34c', {"x": 0.8283, "y": 0.6908, "w": 0.094, "h": 0.0543, "bg": "#f5b941", "fg": "#651a06", "contenu": "prix", "forme": "ovale"}),
    1069: ('products/Combo_Week-end_Yassa_44f03cf2', {"x": 0.8283, "y": 0.6908, "w": 0.094, "h": 0.0543, "bg": "#f5b941", "fg": "#641a06", "contenu": "prix", "forme": "ovale"}),
    1070: ('products/Pizza_4_Fromages_5cadd940', {"x": 0.8516, "y": 0.517, "w": 0.0847, "h": 0.0539, "bg": "#e6be50", "fg": "#5b1103", "contenu": "prix", "forme": "ovale"}),
    1073: ('products/Pizza_Crevettes_6c72f381', {"x": 0.8516, "y": 0.517, "w": 0.0847, "h": 0.0539, "bg": "#e6be50", "fg": "#5b1103", "contenu": "prix", "forme": "ovale"}),
    1078: ('products/RESTO-0033_9c2ac1b4', {"x": 0.8188, "y": 0.478, "w": 0.1217, "h": 0.056, "bg": "#deb25b", "fg": "#6c1904", "contenu": "prix", "forme": "ovale"}),
    1079: ('products/Pizza_au_Poulet_c8bcecb6', {"x": 0.8516, "y": 0.517, "w": 0.0847, "h": 0.0539, "bg": "#e6be50", "fg": "#5b1103", "contenu": "prix", "forme": "ovale"}),
    1084: ('products/Pizza_Viande_Hachée_53388a82', {"x": 0.8516, "y": 0.517, "w": 0.0847, "h": 0.0539, "bg": "#e6be50", "fg": "#5b1103", "contenu": "prix", "forme": "ovale"}),
    1146: ('products/product_poisson_frit_v2_f3bd5b69', {"x": 0.8373, "y": 0.5104, "w": 0.0989, "h": 0.0542, "bg": "#e9c35a", "fg": "#5a1010", "contenu": "prix", "forme": "ovale"}),
    1147: ('products/product_thiep_au_poulet_v2_888db8d5', {"x": 0.8134, "y": 0.4769, "w": 0.126, "h": 0.075, "bg": "#efc567", "fg": "#5a1010", "contenu": "prix", "forme": "ovale"}),
}


def appliquer(apps, schema_editor):
    Product = apps.get_model("catalog", "Product")
    for pk, (image, zone) in ZONES.items():
        Product.objects.filter(pk=pk, image=image, price_zone__isnull=True).update(price_zone=zone)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [("catalog", "0015_rattache_categories_supermarche")]
    operations = [migrations.RunPython(appliquer, noop)]
