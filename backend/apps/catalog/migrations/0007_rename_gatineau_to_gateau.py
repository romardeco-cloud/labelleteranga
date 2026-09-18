from django.db import migrations
from django.utils.text import slugify


def rename(apps, schema_editor):
    Category = apps.get_model("catalog", "Category")
    if Category.objects.filter(name="GATEAU").exists():
        old = Category.objects.filter(name="GATINEAU").first()
        if old:
            apps.get_model("catalog", "Product").objects.filter(category=old).update(category=Category.objects.get(name="GATEAU"))
            old.delete()
        return
    old = Category.objects.filter(name="GATINEAU").first()
    if old:
        old.name = "GATEAU"
        old.slug = slugify("GATEAU")
        old.save()
    else:
        Category.objects.create(name="GATEAU", slug=slugify("GATEAU"))


class Migration(migrations.Migration):
    dependencies = [("catalog", "0006_seed_category_restauration")]
    operations = [migrations.RunPython(rename, migrations.RunPython.noop)]
