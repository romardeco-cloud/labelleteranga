from django.db import migrations, models


def recopier_fond_de_caisse(apps, schema_editor):
    """
    Recopie sur chaque fermeture de caissier deja existante le fond de caisse de son premier jour couvert
    (meme regle que l'ancien DailyClosingSerializer.get_opening_cash), avant que les ouvertures ne soient
    desormais supprimees a chaque fermeture.
    """
    DailyClosing = apps.get_model("reports", "DailyClosing")
    CashierOpening = apps.get_model("reports", "CashierOpening")
    for closing in DailyClosing.objects.filter(cashier__isnull=False, opening_cash__isnull=True):
        opening = CashierOpening.objects.filter(
            date=closing.date, point_of_sale_id=closing.point_of_sale_id, cashier_id=closing.cashier_id
        ).first()
        if opening:
            closing.opening_cash = opening.opening_cash
            closing.save(update_fields=["opening_cash"])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [("reports", "0019_supprime_doublon_cloture_28_resto_2")]
    operations = [
        migrations.AddField(
            model_name="dailyclosing",
            name="opening_cash",
            field=models.DecimalField(
                blank=True, decimal_places=2, max_digits=12, null=True, verbose_name="Fond de caisse (informatif)"
            ),
        ),
        migrations.RunPython(recopier_fond_de_caisse, noop),
    ]
