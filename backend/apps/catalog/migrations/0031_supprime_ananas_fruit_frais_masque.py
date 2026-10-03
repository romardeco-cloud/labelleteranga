from django.db import migrations

# Demande de l'admin (03/10/2026) : supprimer les produits masques. Le seul restant, "Ananas fruit frais" (masque,
# rattache a aucun magasin), est supprime s'il est toujours masque et sans magasin.


def appliquer(apps, schema_editor):
    Product = apps.get_model("catalog", "Product")
    Stock = apps.get_model("stores", "Stock")
    p = Product.objects.filter(pk=1887, name="Ananas fruit frais", is_active=False).first()
    if p and not Stock.objects.filter(product=p).exists():
        p.delete()


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [("catalog", "0030_masque_doublons_renommes"), ("stores", "0052_produits_supermarche_ziguinchor")]
    operations = [migrations.RunPython(appliquer, noop)]
