from decimal import Decimal

from django.db import migrations


def supprimer_doublon(apps, schema_editor):
    """
    Le 28/09/2026 (Resto), la fermeture automatique (id 16, 60 800 FCFA) faisait double emploi avec la fermeture
    manuelle faite ensuite par l'admin (id 17, 66 900 FCFA, la bonne). Demande explicite de l'admin : ne garder
    que celle a 66 900 FCFA. Filtres larges pour ne rien supprimer si l'etat ne correspond plus a celui constate.
    """
    DailyClosing = apps.get_model("reports", "DailyClosing")
    closing = DailyClosing.objects.filter(pk=16, date="2026-09-28", auto_closed=True).first()
    if closing and closing.expected_card + closing.expected_wave + closing.expected_orange_money + closing.expected_cash == Decimal("60800"):
        closing.delete()


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [("reports", "0017_reinitialise_ouverture_du_27")]
    operations = [migrations.RunPython(supprimer_doublon, noop)]
