from django.db import migrations

# Liens marchands contenus dans les QR codes Wave et Orange Money fournis (modifiables dans Parametres > Finances)
WAVE = "https://pay.wave.com/m/M_GzHNzzg7smOc/c/sn/?src=p"
ORANGE = "https://qrcode.orange.sn/dcwFqEKPPxHZFPrHvp3SJd"


def seed(apps, schema_editor):
    PointOfSale = apps.get_model("stores", "PointOfSale")
    StoreSettings = apps.get_model("stores", "StoreSettings")
    for store in PointOfSale.objects.filter(online_enabled=True):
        st, _ = StoreSettings.objects.get_or_create(point_of_sale=store)
        st.wave_pay_url = st.wave_pay_url or WAVE
        st.orange_pay_url = st.orange_pay_url or ORANGE
        st.save()


class Migration(migrations.Migration):
    dependencies = [("stores", "0011_storesettings_orange_pay_url_and_more")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
