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

    class Channel(models.TextChoices):
        ONLINE = "online", "En ligne"
        POS = "pos", "Caisse (magasin)"

    reference = models.CharField(max_length=40, unique=True, default=generate_order_reference)
    channel = models.CharField(max_length=10, choices=Channel.choices, default=Channel.ONLINE)
    cashier = models.ForeignKey(
        "auth.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="pos_sales"
    )
    point_of_sale = models.ForeignKey(
        "stores.PointOfSale",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="orders",
        help_text="Magasin ayant traite la commande (optionnel, pour la cloture de caisse par magasin).",
    )
    class ServiceMode(models.TextChoices):
        DIRECT = "direct", "Vente directe"
        DINE_IN = "dine_in", "Sur place"

    class Fulfillment(models.TextChoices):
        DELIVERY = "delivery", "Livraison"
        PICKUP = "pickup", "A emporter"

    fulfillment = models.CharField(max_length=10, choices=Fulfillment.choices, default=Fulfillment.DELIVERY)
    service_mode = models.CharField(max_length=10, choices=ServiceMode.choices, default=ServiceMode.DIRECT)
    table_label = models.CharField("Table", max_length=40, blank=True)
    customer_name = models.CharField(max_length=150)
    customer_email = models.EmailField(blank=True)
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
    # sent | failed | not_configured | "" (pas encore tente)
    whatsapp_status = models.CharField(max_length=20, blank=True)
    whatsapp_error = models.CharField(max_length=250, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    # paiement par QR (Wave / Orange Money) : le client declare avoir paye et donne la reference de sa transaction
    payment_reference = models.CharField(max_length=60, blank=True)
    payment_declared_at = models.DateTimeField(null=True, blank=True)
    ack_whatsapp_status = models.CharField(max_length=20, blank=True)  # message de prise en charge : sent | failed | not_configured
    ack_whatsapp_error = models.CharField(max_length=250, blank=True)
    received_at = models.DateTimeField("Reception confirmee a la caisse", null=True, blank=True)  # vide : l'alerte clignote et sonne
    handled_at = models.DateTimeField("Commande finalisee a la caisse", null=True, blank=True)  # tant qu'elle est vide, l'alerte clignote a la caisse
    tip_amount = models.DecimalField("Pourboire", max_digits=12, decimal_places=2, default=0)
    discount_amount = models.DecimalField("Remise fidelite", max_digits=12, decimal_places=2, default=0)
    reward_label = models.CharField(max_length=160, blank=True)
    voided_at = models.DateTimeField(null=True, blank=True)
    voided_by = models.ForeignKey("auth.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    void_reason = models.CharField(max_length=200, blank=True)
    payment_method_changed_at = models.DateTimeField(null=True, blank=True)
    payment_method_changed_by = models.ForeignKey("auth.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    payment_method_change_reason = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def recompute_total(self):
        subtotal = sum(item.subtotal for item in self.items.all())
        self.total_amount = max(subtotal - (self.discount_amount or 0), 0) + (self.tip_amount or 0)
        return self.total_amount

    @property
    def order_number(self):
        """Numero de commande communique au client (WhatsApp, ticket, admin)."""
        return self.reference[:8].upper()

    @property
    def site_base(self):
        """Prefixe d'URL du site d'ou vient la commande (retour de paiement au bon site)."""
        store = self.point_of_sale
        return f"/s/{store.slug}" if store and store.slug else ""

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
