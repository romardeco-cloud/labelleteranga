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


class StockMovement(models.Model):
    """Journal de chaque variation de stock (ventes, receptions, inventaires, corrections...)."""

    class Reason(models.TextChoices):
        SALE_POS = "sale_pos", "Vente en caisse"
        INVOICE = "invoice", "Facture client"
        INVOICE_CANCEL = "invoice_cancel", "Annulation de facture"
        PURCHASE_RECEIPT = "purchase_receipt", "Reception fournisseur"
        MANUAL = "manual", "Correction manuelle"
        INVENTORY = "inventory", "Ajustement d'inventaire"
        IMPORT = "import", "Import Excel"

    product = models.ForeignKey("catalog.Product", related_name="stock_movements", on_delete=models.CASCADE)
    point_of_sale = models.ForeignKey(PointOfSale, related_name="stock_movements", on_delete=models.CASCADE)
    delta = models.IntegerField()
    quantity_after = models.PositiveIntegerField()
    reason = models.CharField(max_length=20, choices=Reason.choices)
    reference = models.CharField(max_length=60, blank=True)
    user = models.ForeignKey("auth.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"{self.product_id} @ {self.point_of_sale_id}: {self.delta:+d}"


class InventoryCount(models.Model):
    """Inventaire physique d'un point de vente : photo du stock theorique, comptage, puis ajustement."""

    class Status(models.TextChoices):
        DRAFT = "draft", "En cours"
        VALIDATED = "validated", "Valide"
        CANCELLED = "cancelled", "Annule"

    number = models.CharField(max_length=30, unique=True, editable=False)
    point_of_sale = models.ForeignKey(PointOfSale, related_name="inventory_counts", on_delete=models.PROTECT)
    date = models.DateField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey("auth.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    validated_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "-id"]

    def __str__(self):
        return self.number


class InventoryCountLine(models.Model):
    count = models.ForeignKey(InventoryCount, related_name="lines", on_delete=models.CASCADE)
    product = models.ForeignKey("catalog.Product", related_name="+", on_delete=models.CASCADE)
    theoretical_quantity = models.IntegerField()
    counted_quantity = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        unique_together = ("count", "product")
        ordering = ["product__name"]

    @property
    def variance(self):
        return None if self.counted_quantity is None else self.counted_quantity - self.theoretical_quantity
