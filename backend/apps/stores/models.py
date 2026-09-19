from django.db import models


class PointOfSale(models.Model):
    name = models.CharField("Nom", max_length=120, unique=True)
    address = models.CharField("Adresse", max_length=255, blank=True)
    phone = models.CharField("Telephone", max_length=30, blank=True)
    slug = models.SlugField("Identifiant du site", max_length=60, unique=True, null=True, blank=True)
    online_enabled = models.BooleanField("Site web en ligne", default=False)
    description = models.CharField("Description courte", max_length=200, blank=True)
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
        ONLINE_ORDER = "online_order", "Commande en ligne"
        SALE_VOID = "sale_void", "Vente annulee"
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


class StoreCategory(models.Model):
    """Categories affichees pour un point de vente (ordre, icone en caisse). Les categories elles-memes sont partagees."""

    point_of_sale = models.ForeignKey(PointOfSale, related_name="store_categories", on_delete=models.CASCADE)
    category = models.ForeignKey("catalog.Category", related_name="store_links", on_delete=models.CASCADE)
    order = models.PositiveIntegerField("Ordre", default=0)

    class Meta:
        unique_together = ("point_of_sale", "category")
        ordering = ["order", "category__name"]

    def __str__(self):
        return f"{self.point_of_sale} / {self.category}"


def default_payment_methods():
    return ["cash", "wave", "orange_money", "card"]


class StoreSettings(models.Model):
    """Parametres d'un point de vente (identite legale, finances, ticket, modules de la caisse)."""

    point_of_sale = models.OneToOneField(PointOfSale, related_name="settings", on_delete=models.CASCADE)
    timezone = models.CharField("Fuseau horaire", max_length=60, default="Africa/Dakar")
    email = models.EmailField(blank=True, default="info@labelleteranga.com")
    # informations legales
    legal_form = models.CharField("Forme juridique", max_length=60, blank=True)
    share_capital = models.DecimalField("Capital social", max_digits=14, decimal_places=0, null=True, blank=True)
    ninea = models.CharField("NINEA", max_length=60, blank=True)
    rccm = models.CharField("RCCM", max_length=60, blank=True)
    # finances
    vat_rate = models.DecimalField("TVA (%)", max_digits=5, decimal_places=2, default=0)
    prices_include_vat = models.BooleanField("Prix TTC", default=True)
    payment_methods = models.JSONField("Moyens de paiement acceptes", default=default_payment_methods)
    # apparence du ticket
    # suivi du stock : desactive (restaurant, plats faits a la commande) => jamais de rupture ni de sortie de stock
    track_stock = models.BooleanField("Suivi du stock", default=True)
    receipt_slogan = models.CharField(max_length=120, blank=True, default="L'art du service")
    receipt_footer = models.CharField(max_length=200, blank=True, default="Merci de votre visite !")
    # modules de la caisse
    module_hold = models.BooleanField("Ventes en attente", default=True)
    module_history = models.BooleanField("Historique du jour", default=True)
    module_qr = models.BooleanField("QR Wave / Orange Money", default=True)
    module_dine_in = models.BooleanField("Vente sur place (tables)", default=True)
    module_customer_orders = models.BooleanField("Commandes client", default=True)
    module_drawer = models.BooleanField("Tiroir-caisse", default=True)
    module_xreport = models.BooleanField("Rapport X", default=True)

    def __str__(self):
        return f"Parametres de {self.point_of_sale}"


UNLIMITED_STOCK = 9999


def tracks_stock(store):
    """False pour un point de vente sans suivi de stock (ex. restaurant) : quantite toujours disponible."""
    return get_settings(store).track_stock if store else True


def get_settings(store):
    settings, _ = StoreSettings.objects.get_or_create(point_of_sale=store)
    return settings


class DrawerOpening(models.Model):
    """Ouverture du tiroir-caisse hors vente (pour controle : qui, quand, pourquoi)."""

    point_of_sale = models.ForeignKey(PointOfSale, related_name="drawer_openings", on_delete=models.CASCADE)
    cashier = models.ForeignKey("auth.User", null=True, on_delete=models.SET_NULL, related_name="+")
    reason = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
