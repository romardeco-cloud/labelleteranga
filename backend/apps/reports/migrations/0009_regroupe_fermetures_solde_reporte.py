from django.db import migrations


def merge_carryover_closings(apps, schema_editor):
    """
    Ancien mecanisme : quand un caissier fermait apres avoir laisse un jour precedent non ferme, le systeme
    creait DEUX fermetures (celle du jour precedent, a l'equilibre, notee "Solde reporte", et celle du jour
    de la fermeture reelle, avec covers_from pointant vers l'ancienne). Le nouveau mecanisme n'en cree plus
    qu'une seule, datee du premier jour non ferme. Cette migration fusionne les paires existantes creees par
    l'ancien mecanisme : la fermeture "a l'equilibre" est supprimee, et celle qui portait les vrais montants
    est redatee au premier jour (covers_through = son ancienne date).
    """
    DailyClosing = apps.get_model("reports", "DailyClosing")
    for later in DailyClosing.objects.filter(covers_from__isnull=False):
        earlier = DailyClosing.objects.filter(
            date=later.covers_from, point_of_sale=later.point_of_sale, cashier=later.cashier, auto_closed=True,
        ).first()
        if not earlier:
            continue
        covers_through = later.date
        started = earlier.date
        earlier.delete()
        DailyClosing.objects.filter(pk=later.pk).update(date=started, covers_through=covers_through, covers_from=None)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("reports", "0008_dailyclosing_covers_through_and_more"),
    ]

    operations = [
        migrations.RunPython(merge_carryover_closings, noop),
    ]
