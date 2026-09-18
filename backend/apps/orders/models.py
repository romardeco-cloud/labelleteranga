import uuid

from django.db import models

from apps.catalog.models import Product


def generate_order_reference():
    return uuid.uuid4().hex


class Order(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "En attente de paiement"
        PAID = "paid", "Payee"
        FAILED = "failed", "Echouee"
        CANCELLED = "cancelled", "Annulee"

    class PaymentMethod(models.TextChoices):
        CARD = "card", "Carte bancaire (Stripe)"
        WAVE = "wave", "Wave"
        ORANGE_MONEY = "orange_money", "Orange Money"
        CASH = "cash", "Especes a la livraison"

    reference = models.CharField(max_length=40, unique=True, default=generate_order_reference)
    customer_name = models.CharField(max_length=150)
    customer_email = models.EmailField()
    customer_phone = models.CharField(max_length=30, blank=True)
    delivery_address = models.TextField(blank=True)
    delivery_latitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    delivery_longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    payment_method = models.CharField(max_length=20, choices=PaymentMethod.choices, default=PaymentMethod.CASH)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    stripe_checkout_session_id = models.CharField(max_length=255, blank=True)
    stripe_payment_intent_id = models.CharField(max_length=255, blank=True)
    wave_checkout_id = models.CharField(max_length=255, blank=True)
    orange_money_order_id = models.CharField(max_length=255, blank=True)
    whatsapp_confirmation_sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def recompute_total(self):
        self.total_amount = sum(item.subtotal for item in self.items.all())
        return self.total_amount

    @property
    def location_maps_url(self):
        if self.delivery_latitude is not None and self.delivery_longitude is not None:
            return f"https://maps.google.com/?q={self.delivery_latitude},{self.delivery_longitude}"
        return None

    def __str__(self):
        return f"Commande {self.reference} ({self.get_status_display()})"


class OrderItem(models.Model):
    order = models.ForeignKey(Order, related_name="items", on_delete=models.CASCADE)
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True)
    product_name = models.CharField(max_length=200)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    quantity = models.PositiveIntegerField(default=1)

    @property
    def subtotal(self):
        return self.unit_price * self.quantity

    def __str__(self):
        return f"{self.product_name} x{self.quantity}"
