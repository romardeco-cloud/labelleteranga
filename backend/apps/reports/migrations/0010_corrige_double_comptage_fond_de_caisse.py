from django.db import migrations


def recompute_grouped_closings(apps, schema_editor):
    """
    Les fermetures regroupees (covers_through non vide) creees par l'ANCIEN mecanisme de report comptaient le
    fond de caisse de CHAQUE jour du groupe (ex. 24 ET 25 septembre), alors qu'un seul fond de caisse est
    reellement pose dans le tiroir. Cette migration recalcule ces fermetures avec la meme logique que le code
    actuel (un seul fond de caisse, celui du premier jour) et remet les montants declares a l'identique
    (aucun ecart reel constate, seule la comptabilisation etait fausse).
    """
    from decimal import Decimal

    DailyClosing = apps.get_model("reports", "DailyClosing")
    Order = apps.get_model("orders", "Order")
    CashierOpening = apps.get_model("reports", "CashierOpening")

    for closing in DailyClosing.objects.filter(covers_through__isnull=False):
        totals = {"card": Decimal("0"), "wave": Decimal("0"), "orange_money": Decimal("0"), "cash": Decimal("0")}
        qs = Order.objects.filter(
            status="paid",
            channel="pos",
            cashier=closing.cashier,
            point_of_sale=closing.point_of_sale,
            paid_at__date__gte=closing.date,
            paid_at__date__lte=closing.covers_through,
        )
        from django.db.models import Sum

        for row in qs.values("payment_method").annotate(t=Sum("total_amount")):
            if row["payment_method"] in totals:
                totals[row["payment_method"]] = row["t"] or Decimal("0")
        opening = CashierOpening.objects.filter(
            date=closing.date, point_of_sale=closing.point_of_sale, cashier=closing.cashier
        ).first()
        if opening:
            totals["cash"] += opening.opening_cash

        old_expected_total = closing.expected_card + closing.expected_wave + closing.expected_orange_money + closing.expected_cash
        new_expected_total = totals["card"] + totals["wave"] + totals["orange_money"] + totals["cash"]
        if old_expected_total == new_expected_total:
            continue  # deja correct, rien a faire

        closing.expected_card = totals["card"]
        closing.expected_wave = totals["wave"]
        closing.expected_orange_money = totals["orange_money"]
        closing.expected_cash = totals["cash"]
        closing.declared_card = totals["card"]
        closing.declared_wave = totals["wave"]
        closing.declared_orange_money = totals["orange_money"]
        closing.declared_cash = totals["cash"]
        closing.save()


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("reports", "0009_regroupe_fermetures_solde_reporte"),
    ]

    operations = [
        migrations.RunPython(recompute_grouped_closings, noop),
    ]
