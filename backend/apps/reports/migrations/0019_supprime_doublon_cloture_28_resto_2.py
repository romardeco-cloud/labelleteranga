from decimal import Decimal

from django.db import migrations


def supprimer_doublon(apps, schema_editor):
    """
    Le 28/09/2026 (Resto), une fermeture automatique (id 18, 74 900 FCFA) a de nouveau fait double emploi avec
    la fermeture manuelle deja faite par l'admin (id 17, 66 900 FCFA, la bonne, confirmee par l'admin contre le
    rapport PDF). Cause : la fermeture automatique ne reconnaissait pas une fermeture GLOBALE du point de vente
    (sans caissier precis) comme fermant deja la journee pour ce caissier - corrige dans apps.pos.services et
    DailyClosing.covering (voir migration suivante pour la non-recurrence). Ici, nettoyage du doublon deja cree.
    """
    DailyClosing = apps.get_model("reports", "DailyClosing")
    closing = DailyClosing.objects.filter(pk=18, date="2026-09-28", auto_closed=True).first()
    if closing and closing.expected_card + closing.expected_wave + closing.expected_orange_money + closing.expected_cash == Decimal("74900"):
        closing.delete()


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [("reports", "0018_supprime_doublon_cloture_28_resto")]
    operations = [migrations.RunPython(supprimer_doublon, noop)]
