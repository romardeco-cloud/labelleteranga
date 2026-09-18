from django.conf import settings
from django.db import models


class CashierProfile(models.Model):
    """
    Compte caissier : un utilisateur non-admin, rattache a un point de vente.
    Il ne peut acceder qu'a l'ecran de caisse (/caisse), jamais aux rapports,
    prix, clotures ou reglages.
    """

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="cashier_profile")
    point_of_sale = models.ForeignKey("stores.PointOfSale", on_delete=models.PROTECT, related_name="cashiers")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username} @ {self.point_of_sale.name}"
