from datetime import date
from decimal import Decimal

from django.db import migrations


def corriger(apps, schema_editor):
    """
    Fermeture du 24/09/2026 (Resto, id 8) : les 3 ventes faites juste apres minuit (25/09, 700 especes + 6 000 Wave)
    avaient ete ajoutees deux fois lors de la correction manuelle de cette nuit-la (attendu et declare 58 900 au lieu
    de 52 200 = 47 200 de ventes + 5 000 de fond de caisse, encore compte dans la fermeture a cette epoque).
    Demande de l'admin : ramener attendu et declare a 52 200, sans ecart. Rien n'est modifie si les montants ne
    correspondent plus a ceux constates le 02/10/2026.
    """
    DailyClosing = apps.get_model("reports", "DailyClosing")
    c = DailyClosing.objects.filter(pk=8, date=date(2026, 9, 24), cashier__isnull=False).first()
    if not c:
        return
    avant = (c.expected_cash, c.expected_wave, c.declared_cash, c.declared_wave)
    if avant != (Decimal("26700"), Decimal("32200"), Decimal("26700"), Decimal("32200")):
        return
    if c.expected_card or c.expected_orange_money or c.declared_card or c.declared_orange_money:
        return
    c.expected_cash = c.declared_cash = Decimal("26000")
    c.expected_wave = c.declared_wave = Decimal("26200")
    c.initial_discrepancy_total = Decimal("0")
    c.notes = (c.notes + "\nCorrige le 02/10/2026 : les 6 700 FCFA de ventes d'apres minuit etaient comptes deux fois (58 900 -> 52 200).").strip()
    c.save(update_fields=["expected_cash", "expected_wave", "declared_cash", "declared_wave", "initial_discrepancy_total", "notes"])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [("reports", "0021_corrige_cloture_01_10_ventes_apres_minuit")]
    operations = [migrations.RunPython(corriger, noop)]
