from datetime import date, time
from decimal import Decimal

from django.db import migrations
from django.db.models import Sum

GRACE_CUTOFF = time(2, 30)


def corriger(apps, schema_editor):
    """
    Le 01/10/2026, le caissier Resto a ferme apres minuit : l'apercu affichait 41 300 FCFA (ventes d'apres minuit
    comprises), mais la fermeture a ete enregistree avec un attendu de 39 800 FCFA (ventes d'apres minuit
    oubliees, bug corrige dans apps.pos.services._sales_totals_range), d'ou un faux ecart de +1 500 FCFA.
    On ajoute a l'attendu les ventes du 02/10 avant 2h30 faites avant la fermeture. Rien n'est modifie si les
    montants ne correspondent plus exactement a ceux constates.
    """
    DailyClosing = apps.get_model("reports", "DailyClosing")
    Order = apps.get_model("orders", "Order")
    methods = ("card", "wave", "orange_money", "cash")

    def total(c, prefix):
        return sum(getattr(c, f"{prefix}_{m}") for m in methods)

    for closing in DailyClosing.objects.filter(date=date(2026, 10, 1), cashier__isnull=False, auto_closed=False):
        if total(closing, "expected") != Decimal("39800") or total(closing, "declared") != Decimal("41300"):
            continue
        missed = Order.objects.filter(
            status="paid",
            channel="pos",
            cashier_id=closing.cashier_id,
            point_of_sale_id=closing.point_of_sale_id,
            paid_at__date=date(2026, 10, 2),
            paid_at__time__lt=GRACE_CUTOFF,
            paid_at__lt=closing.closed_at,
        )
        by_method = {row["payment_method"]: row["t"] or Decimal("0") for row in missed.values("payment_method").annotate(t=Sum("total_amount"))}
        if sum(by_method.values()) != Decimal("1500"):
            continue
        for m in methods:
            setattr(closing, f"expected_{m}", getattr(closing, f"expected_{m}") + by_method.get(m, Decimal("0")))
        closing.initial_discrepancy_total = Decimal("0")
        closing.notes = (closing.notes + " | Ecart de +1 500 corrige : ventes d'apres minuit oubliees par le systeme.").strip(" |")
        closing.save(update_fields=[*(f"expected_{m}" for m in methods), "initial_discrepancy_total", "notes"])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [("reports", "0020_fond_de_caisse_sur_fermeture"), ("orders", "0018_order_orange_money_webhook_token")]
    operations = [migrations.RunPython(corriger, noop)]
