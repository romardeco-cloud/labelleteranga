from django.db import migrations
from django.utils.text import slugify


def seed(apps, schema_editor):
    Category = apps.get_model("catalog", "Category")
    Category.objects.get_or_create(name="RESTAURATION", defaults={"slug": slugify("RESTAURATION")})


class Migration(migrations.Migration):
    dependencies = [("catalog", "0005_seed_categories")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
