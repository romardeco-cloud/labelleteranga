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

    reference = models.CharField(max_length=40, unique=True, default=generate_order_reference)
    customer_name = models.CharField(max_length=150)
    customer_email = models.EmailField()
    customer_phone = models.CharField(max_length=30, blank=True)
    delivery_address = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    stripe_checkout_session_id = models.CharField(max_length=255, blank=True)
    stripe_payment_intent_id = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def recompute_total(self):
        self.total_amount = sum(item.subtotal for item in self.items.all())
        return self.total_amount

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
