from django.apps import AppConfig


class StoresConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.stores"
    label = "stores"
    verbose_name = "Points de vente"

    def ready(self):
        from . import signals  # noqa: F401 - supermarches lies (signals.py)
