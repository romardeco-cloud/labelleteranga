from django.db import migrations
from django.utils.text import slugify


def rename(apps, schema_editor):
    Category = apps.get_model("catalog", "Category")
    Product = apps.get_model("catalog", "Product")
    target = Category.objects.filter(name="GÂTEAU").first()
    old = Category.objects.filter(name="GATEAU").first()
    if target and old:
        Product.objects.filter(category=old).update(category=target)
        old.delete()
    elif old:
        old.name = "GÂTEAU"
        old.slug = slugify("GÂTEAU")
        old.save()
    elif not target:
        Category.objects.create(name="GÂTEAU", slug=slugify("GÂTEAU"))


class Migration(migrations.Migration):
    dependencies = [("catalog", "0007_rename_gatineau_to_gateau")]
    operations = [migrations.RunPython(rename, migrations.RunPython.noop)]
