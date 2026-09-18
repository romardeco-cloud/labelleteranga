from django.conf import settings
from django.db import models

PAYMENT_METHOD_KEYS = ["card", "wave", "orange_money", "cash"]


class DailyClosing(models.Model):
    """
    Cloture de caisse d'une journee : montants attendus (calcules a partir
    des commandes payees ce jour-la) vs montants declares/comptes par
    l'admin, par moyen de paiement. L'ecart est la difference entre les
    deux, utile pour reperer un manque ou un surplus de caisse.
    """

    date = models.DateField(unique=True)
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="daily_closings"
    )
    closed_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    expected_card = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    expected_wave = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    expected_orange_money = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    expected_cash = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    declared_card = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    declared_wave = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    declared_orange_money = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    declared_cash = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-date"]

    @property
    def expected_total(self):
        return self.expected_card + self.expected_wave + self.expected_orange_money + self.expected_cash

    @property
    def declared_total(self):
        return self.declared_card + self.declared_wave + self.declared_orange_money + self.declared_cash

    @property
    def discrepancy_total(self):
        return self.declared_total - self.expected_total

    @property
    def discrepancy_card(self):
        return self.declared_card - self.expected_card

    @property
    def discrepancy_wave(self):
        return self.declared_wave - self.expected_wave

    @property
    def discrepancy_orange_money(self):
        return self.declared_orange_money - self.expected_orange_money

    @property
    def discrepancy_cash(self):
        return self.declared_cash - self.expected_cash

    def __str__(self):
        return f"Cloture du {self.date}"
