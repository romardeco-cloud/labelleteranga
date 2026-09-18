from django.db import models


class PointOfSale(models.Model):
    name = models.CharField("Nom", max_length=120, unique=True)
    address = models.CharField("Adresse", max_length=255, blank=True)
    phone = models.CharField("Telephone", max_length=30, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "Point de vente"
        verbose_name_plural = "Points de vente"

    def __str__(self):
        return self.name


class Stock(models.Model):
    product = models.ForeignKey("catalog.Product", related_name="stocks", on_delete=models.CASCADE)
    point_of_sale = models.ForeignKey(PointOfSale, related_name="stocks", on_delete=models.CASCADE)
    quantity = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("product", "point_of_sale")
        verbose_name = "Stock"
        verbose_name_plural = "Stocks"

    def __str__(self):
        return f"{self.product.name} @ {self.point_of_sale.name} : {self.quantity}"
