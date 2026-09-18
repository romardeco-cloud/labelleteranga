from decimal import Decimal

from django.conf import settings
from django.db import models, transaction
from django.utils import timezone

TWO = Decimal("0.01")


class PaymentMethod(models.TextChoices):
    CASH = "cash", "Especes"
    WAVE = "wave", "Wave"
    ORANGE_MONEY = "orange_money", "Orange Money"
    CARD = "card", "Carte bancaire"
    BANK_TRANSFER = "bank_transfer", "Virement bancaire"
    CHEQUE = "cheque", "Cheque"


class Party(models.Model):
    name = models.CharField(max_length=200)
    phone = models.CharField(max_length=40, blank=True)
    email = models.EmailField(blank=True)
    address = models.CharField(max_length=255, blank=True)
    tax_id = models.CharField("NINEA / RC", max_length=60, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        abstract = True
        ordering = ["name"]

    def __str__(self):
        return self.name


class Customer(Party):
    class Meta(Party.Meta):
        verbose_name = "Client"


class Supplier(Party):
    class Meta(Party.Meta):
        verbose_name = "Fournisseur"


class DocumentSequence(models.Model):
    kind = models.CharField(max_length=10)
    year = models.PositiveIntegerField()
    last_number = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = ("kind", "year")


def next_number(kind, prefix):
    """Numero sequentiel sans trou par type et par annee, ex. FAC-2026-0007."""
    year = timezone.localdate().year
    with transaction.atomic():
        seq, _ = DocumentSequence.objects.select_for_update().get_or_create(kind=kind, year=year)
        seq.last_number += 1
        seq.save(update_fields=["last_number"])
    return f"{prefix}-{year}-{seq.last_number:04d}"


def money(value):
    return Decimal(value).quantize(TWO)


class Line(models.Model):
    product = models.ForeignKey("catalog.Product", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    description = models.CharField(max_length=255)
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=1)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)

    class Meta:
        abstract = True

    @property
    def line_total(self):
        return money(self.quantity * self.unit_price * (Decimal("100") - self.discount_percent) / Decimal("100"))


class Document(models.Model):
    number = models.CharField(max_length=30, unique=True, editable=False)
    point_of_sale = models.ForeignKey("stores.PointOfSale", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    date = models.DateField(default=timezone.localdate)
    tax_rate = models.DecimalField("TVA (%)", max_digits=5, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    payment_method = models.CharField(max_length=20, choices=PaymentMethod.choices, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
        ordering = ["-date", "-id"]

    @property
    def subtotal(self):
        return money(sum((i.line_total for i in self.items.all()), Decimal("0")))

    @property
    def tax_amount(self):
        return money(self.subtotal * self.tax_rate / Decimal("100"))

    @property
    def total(self):
        return money(self.subtotal + self.tax_amount)

    def __str__(self):
        return self.number


class Quote(Document):
    class Status(models.TextChoices):
        DRAFT = "draft", "Brouillon"
        SENT = "sent", "Envoye"
        ACCEPTED = "accepted", "Accepte"
        REJECTED = "rejected", "Refuse"

    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="quotes")
    valid_until = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    payment_terms = models.CharField(max_length=255, blank=True)

    class Meta(Document.Meta):
        verbose_name = "Devis"
        verbose_name_plural = "Devis"

    @property
    def is_expired(self):
        return bool(
            self.valid_until
            and self.valid_until < timezone.localdate()
            and self.status in (self.Status.DRAFT, self.Status.SENT)
        )


class QuoteItem(Line):
    quote = models.ForeignKey(Quote, on_delete=models.CASCADE, related_name="items")


class Invoice(Document):
    class Status(models.TextChoices):
        ISSUED = "issued", "Emise"
        CANCELLED = "cancelled", "Annulee"

    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="invoices")
    due_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ISSUED)
    source_quote = models.OneToOneField(Quote, null=True, blank=True, on_delete=models.SET_NULL, related_name="invoice")
    stock_deducted = models.BooleanField(default=False)

    class Meta(Document.Meta):
        verbose_name = "Facture"

    @property
    def paid_amount(self):
        return money(sum((p.amount for p in self.payments.all()), Decimal("0")))

    @property
    def balance(self):
        return money(self.total - self.paid_amount)

    @property
    def payment_status(self):
        if self.status == self.Status.CANCELLED:
            return "cancelled"
        paid = self.paid_amount
        if paid <= 0:
            return "unpaid"
        return "paid" if paid >= self.total else "partial"

    @property
    def is_overdue(self):
        return bool(
            self.status == self.Status.ISSUED
            and self.due_date
            and self.due_date < timezone.localdate()
            and self.balance > 0
        )


class InvoiceItem(Line):
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="items")


class Payment(models.Model):
    method = models.CharField(max_length=20, choices=PaymentMethod.choices)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    date = models.DateField(default=timezone.localdate)
    reference = models.CharField("Reference (n° transaction, cheque...)", max_length=100, blank=True)
    notes = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        abstract = True
        ordering = ["date", "id"]


class InvoicePayment(Payment):
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="payments")


class PurchaseOrder(Document):
    class Status(models.TextChoices):
        DRAFT = "draft", "Brouillon"
        SENT = "sent", "Envoye au fournisseur"
        PARTIAL = "partial", "Partiellement recu"
        RECEIVED = "received", "Recu"
        CANCELLED = "cancelled", "Annule"

    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="purchase_orders")
    expected_date = models.DateField("Livraison prevue", null=True, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    payment_terms = models.CharField(max_length=255, blank=True)

    class Meta(Document.Meta):
        verbose_name = "Bon de commande"
        verbose_name_plural = "Bons de commande"

    @property
    def paid_amount(self):
        return money(sum((p.amount for p in self.payments.all()), Decimal("0")))

    @property
    def balance(self):
        return money(self.total - self.paid_amount)

    @property
    def payment_status(self):
        paid = self.paid_amount
        if paid <= 0:
            return "unpaid"
        return "paid" if paid >= self.total else "partial"


class PurchaseOrderItem(Line):
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name="items")
    received_quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)


class PurchaseOrderPayment(Payment):
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name="payments")
