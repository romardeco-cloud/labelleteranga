# Le "Menu du jour" est un concept de restaurant : desactive par defaut pour les points de
# vente existants qui ne sont pas le resto (supermarche, depot, quincaillerie, forage, ferme).
# Un point de vente sans StoreSettings n'est pas concerne (get_settings() le creera avec le
# defaut du modele, True, le jour ou il en a besoin).

from django.db import migrations


def disable_for_non_resto(apps, schema_editor):
    StoreSettings = apps.get_model("stores", "StoreSettings")
    StoreSettings.objects.exclude(point_of_sale__slug="resto").update(module_daily_menu=False)


def reactivate_all(apps, schema_editor):
    StoreSettings = apps.get_model("stores", "StoreSettings")
    StoreSettings.objects.update(module_daily_menu=True)


class Migration(migrations.Migration):

    dependencies = [
        ("stores", "0036_ajoute_module_menu_du_jour"),
    ]

    operations = [
        migrations.RunPython(disable_for_non_resto, reactivate_all),
    ]
