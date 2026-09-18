import uuid

from django.conf import settings
from django.db import models

from apps.catalog.models import Product


def generate_session_key():
    return uuid.uuid4().hex


class Cart(models.Model):
    session_key = models.CharField(max_length=64, unique=True, default=generate_session_key)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="carts"
    )
    point_of_sale = models.ForeignKey(
        "stores.PointOfSale", null=True, blank=True, on_delete=models.SET_NULL, related_name="carts"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def total(self):
        return sum(item.subtotal for item in self.items.select_related("product").all())

    def __str__(self):
        return f"Panier {self.session_key}"


class CartItem(models.Model):
    cart = models.ForeignKey(Cart, related_name="items", on_delete=models.CASCADE)
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    quantity = models.PositiveIntegerField(default=1)

    class Meta:
        unique_together = ("cart", "product")

    @property
    def subtotal(self):
        return self.product.price * self.quantity

    def __str__(self):
        return f"{self.product.name} x{self.quantity}"
