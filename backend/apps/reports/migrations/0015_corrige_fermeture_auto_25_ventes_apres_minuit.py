from django.db import migrations

# La fermeture automatique du 25/09/2026 (id 9) a ete calculee avec une fonction qui ne regardait que la
# date exacte du 25, ratant 4 ventes faites juste apres minuit (00h01-00h21 le 26/09), avant que le
# caissier ait pu fermer lui-meme (commandes 117-120).
ADDED_CASH = 3900  # commandes 117 (1500) + 118 (1400) + 120 (1000), toutes en especes
ADDED_WAVE = 1400  # commande 119, en Wave


def corriger(apps, schema_editor):
    DailyClosing = apps.get_model("reports", "DailyClosing")
    PointOfSale = apps.get_model("stores", "PointOfSale")
    User = apps.get_model("auth", "User")

    store = PointOfSale.objects.filter(name__icontains="Resto").first()
    cashier = User.objects.filter(username="Resto").first()
    if not store or not cashier:
        return

    closing = DailyClosing.objects.filter(point_of_sale=store, cashier=cashier, date="2026-09-25").first()
    if not closing:
        return

    closing.expected_cash += ADDED_CASH
    closing.declared_cash += ADDED_CASH
    closing.expected_wave += ADDED_WAVE
    closing.declared_wave += ADDED_WAVE
    note = (
        "Corrige le 26/09 : la fermeture automatique avait rate 4 ventes faites juste apres minuit "
        "(00h01-00h21 le 26/09, avant que le caissier ferme), 3900 FCFA especes + 1400 FCFA Wave. "
        "Bug corrige dans le code (auto_close_overdue_cashiers utilisait un calcul non conscient de la "
        "periode de grace)."
    )
    closing.notes = f"{closing.notes} {note}".strip() if closing.notes else note
    closing.save()


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("reports", "0014_rattache_ventes_test_a_la_journee_du_24"),
    ]

    operations = [
        migrations.RunPython(corriger, noop),
    ]
