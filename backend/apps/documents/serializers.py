from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from apps.stores.models import Stock

from .models import (
    Customer,
    Invoice,
    InvoiceItem,
    InvoicePayment,
    PurchaseOrder,
    PurchaseOrderItem,
    PurchaseOrderPayment,
    Quote,
    QuoteItem,
    Supplier,
    next_number,
)


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = ["id", "name", "phone", "email", "address", "tax_id", "notes", "created_at"]


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = ["id", "name", "phone", "email", "address", "tax_id", "notes", "created_at"]


LINE_FIELDS = ["id", "product", "description", "quantity", "unit_price", "discount_percent", "line_total"]


class QuoteItemSerializer(serializers.ModelSerializer):
    line_total = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = QuoteItem
        fields = LINE_FIELDS


class InvoiceItemSerializer(serializers.ModelSerializer):
    line_total = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = InvoiceItem
        fields = LINE_FIELDS


class PurchaseOrderItemSerializer(serializers.ModelSerializer):
    line_total = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = PurchaseOrderItem
        fields = LINE_FIELDS + ["received_quantity"]
        read_only_fields = ["received_quantity"]


class PaymentSerializerMixin(serializers.ModelSerializer):
    method_label = serializers.CharField(source="get_method_display", read_only=True)


class InvoicePaymentSerializer(PaymentSerializerMixin):
    class Meta:
        model = InvoicePayment
        fields = ["id", "method", "method_label", "amount", "date", "reference", "notes", "created_at"]
        read_only_fields = ["id", "created_at"]


class PurchaseOrderPaymentSerializer(PaymentSerializerMixin):
    class Meta:
        model = PurchaseOrderPayment
        fields = ["id", "method", "method_label", "amount", "date", "reference", "notes", "created_at"]
        read_only_fields = ["id", "created_at"]


class TotalsMixin(serializers.Serializer):
    subtotal = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    tax_amount = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    total = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    point_of_sale_name = serializers.CharField(source="point_of_sale.name", read_only=True, default=None)
    payment_method_label = serializers.CharField(source="get_payment_method_display", read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True, default=None)


def _replace_items(instance, item_model, fk_name, items):
    item_model.objects.filter(**{fk_name: instance}).delete()
    item_model.objects.bulk_create([item_model(**{fk_name: instance}, **item) for item in items])


def _validate_items(items):
    if not items:
        raise serializers.ValidationError({"items": "Ajoutez au moins une ligne."})
    for it in items:
        if it["quantity"] <= 0:
            raise serializers.ValidationError({"items": "Les quantites doivent etre superieures a zero."})
        if not (0 <= it.get("discount_percent", 0) <= 100):
            raise serializers.ValidationError({"items": "La remise doit etre comprise entre 0 et 100 %."})


def _int_quantity(item):
    q = item["quantity"] if isinstance(item, dict) else item.quantity
    if q != q.to_integral_value():
        name = item["description"] if isinstance(item, dict) else item.description
        raise serializers.ValidationError(
            {"items": f"Quantite non entiere pour '{name}' : impossible de mouvementer le stock."}
        )
    return int(q)


class QuoteSerializer(TotalsMixin, serializers.ModelSerializer):
    items = QuoteItemSerializer(many=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    is_expired = serializers.BooleanField(read_only=True)
    invoice_number = serializers.SerializerMethodField()
    invoice_id = serializers.SerializerMethodField()

    class Meta:
        model = Quote
        fields = [
            "id", "number", "customer", "customer_name", "point_of_sale", "point_of_sale_name", "date",
            "valid_until", "status", "status_label", "is_expired", "tax_rate", "payment_method",
            "payment_method_label", "payment_terms", "notes", "items", "subtotal", "tax_amount", "total",
            "invoice_id", "invoice_number", "created_by_username", "created_at",
        ]
        read_only_fields = ["id", "number", "created_at"]

    def get_invoice_number(self, quote):
        inv = getattr(quote, "invoice", None)
        return inv.number if inv else None

    def get_invoice_id(self, quote):
        inv = getattr(quote, "invoice", None)
        return inv.id if inv else None

    @transaction.atomic
    def create(self, validated_data):
        items = validated_data.pop("items")
        _validate_items(items)
        quote = Quote.objects.create(number=next_number("quote", "DEV"), **validated_data)
        _replace_items(quote, QuoteItem, "quote", items)
        return quote

    @transaction.atomic
    def update(self, instance, validated_data):
        items = validated_data.pop("items", None)
        if items is not None and hasattr(instance, "invoice"):
            raise serializers.ValidationError("Ce devis a deja ete transforme en facture : lignes non modifiables.")
        for k, v in validated_data.items():
            setattr(instance, k, v)
        instance.save()
        if items is not None:
            _validate_items(items)
            _replace_items(instance, QuoteItem, "quote", items)
        return instance


class InvoiceSerializer(TotalsMixin, serializers.ModelSerializer):
    items = InvoiceItemSerializer(many=True)
    payments = InvoicePaymentSerializer(many=True, read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    paid_amount = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    balance = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    payment_status = serializers.CharField(read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    source_quote_number = serializers.CharField(source="source_quote.number", read_only=True, default=None)
    deduct_stock = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = Invoice
        fields = [
            "id", "number", "customer", "customer_name", "point_of_sale", "point_of_sale_name", "date", "due_date",
            "status", "status_label", "tax_rate", "payment_method", "payment_method_label", "notes", "items",
            "subtotal", "tax_amount", "total", "paid_amount", "balance", "payment_status", "is_overdue", "payments",
            "source_quote", "source_quote_number", "stock_deducted", "deduct_stock", "created_by_username",
            "created_at",
        ]
        read_only_fields = ["id", "number", "status", "source_quote", "stock_deducted", "created_at"]

    @transaction.atomic
    def create(self, validated_data):
        items = validated_data.pop("items")
        deduct = validated_data.pop("deduct_stock", False)
        _validate_items(items)
        invoice = Invoice.objects.create(number=next_number("invoice", "FAC"), **validated_data)
        _replace_items(invoice, InvoiceItem, "invoice", items)
        if deduct:
            deduct_invoice_stock(invoice)
        return invoice

    @transaction.atomic
    def update(self, instance, validated_data):
        items = validated_data.pop("items", None)
        validated_data.pop("deduct_stock", None)
        if items is not None and (instance.stock_deducted or instance.payments.exists()):
            raise serializers.ValidationError(
                "Lignes non modifiables : la facture a des paiements ou une sortie de stock. Annulez-la et recreez-la."
            )
        if instance.status == Invoice.Status.CANCELLED:
            raise serializers.ValidationError("Facture annulee : modification impossible.")
        for k, v in validated_data.items():
            setattr(instance, k, v)
        instance.save()
        if items is not None:
            _validate_items(items)
            _replace_items(instance, InvoiceItem, "invoice", items)
        return instance


class PurchaseOrderSerializer(TotalsMixin, serializers.ModelSerializer):
    items = PurchaseOrderItemSerializer(many=True)
    payments = PurchaseOrderPaymentSerializer(many=True, read_only=True)
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    paid_amount = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    balance = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    payment_status = serializers.CharField(read_only=True)

    class Meta:
        model = PurchaseOrder
        fields = [
            "id", "number", "supplier", "supplier_name", "point_of_sale", "point_of_sale_name", "date",
            "expected_date", "status", "status_label", "tax_rate", "payment_method", "payment_method_label",
            "payment_terms", "notes", "items", "subtotal", "tax_amount", "total", "paid_amount", "balance",
            "payment_status", "payments", "created_by_username", "created_at",
        ]
        read_only_fields = ["id", "number", "created_at"]

    @transaction.atomic
    def create(self, validated_data):
        items = validated_data.pop("items")
        _validate_items(items)
        po = PurchaseOrder.objects.create(number=next_number("po", "BC"), **validated_data)
        _replace_items(po, PurchaseOrderItem, "purchase_order", items)
        return po

    @transaction.atomic
    def update(self, instance, validated_data):
        items = validated_data.pop("items", None)
        if items is not None and instance.items.filter(received_quantity__gt=0).exists():
            raise serializers.ValidationError("Des articles ont deja ete recus : lignes non modifiables.")
        for k, v in validated_data.items():
            setattr(instance, k, v)
        instance.save()
        if items is not None:
            _validate_items(items)
            _replace_items(instance, PurchaseOrderItem, "purchase_order", items)
        return instance


def deduct_invoice_stock(invoice):
    """Sortie de stock du point de vente de la facture (tout ou rien)."""
    if not invoice.point_of_sale_id:
        raise serializers.ValidationError({"point_of_sale": "Choisissez un point de vente pour sortir le stock."})
    for item in invoice.items.select_related("product"):
        if not item.product_id:
            continue
        qty = _int_quantity(item)
        stock = Stock.objects.select_for_update().filter(product=item.product, point_of_sale=invoice.point_of_sale).first()
        available = stock.quantity if stock else 0
        if available < qty:
            raise serializers.ValidationError(
                {"items": f"Stock insuffisant pour '{item.product.name}' (disponible : {available})."}
            )
        stock.quantity -= qty
        stock.save(update_fields=["quantity", "updated_at"])
    invoice.stock_deducted = True
    invoice.save(update_fields=["stock_deducted"])


def restore_invoice_stock(invoice):
    for item in invoice.items.select_related("product"):
        if not item.product_id:
            continue
        stock, _ = Stock.objects.select_for_update().get_or_create(product=item.product, point_of_sale=invoice.point_of_sale)
        stock.quantity += _int_quantity(item)
        stock.save(update_fields=["quantity", "updated_at"])
    invoice.stock_deducted = False
    invoice.save(update_fields=["stock_deducted"])


def receive_purchase_order(po, lines):
    """
    Reception fournisseur : lines = [{id, quantity}]. Augmente le stock du point de vente
    de destination pour les lignes liees a un produit.
    """
    if po.status == PurchaseOrder.Status.CANCELLED:
        raise serializers.ValidationError("Bon de commande annule.")
    by_id = {i.id: i for i in po.items.select_related("product")}
    for line in lines:
        item = by_id.get(int(line["id"]))
        if not item:
            raise serializers.ValidationError("Ligne inconnue.")
        qty = Decimal(str(line["quantity"]))
        if qty <= 0:
            continue
        if item.received_quantity + qty > item.quantity:
            raise serializers.ValidationError(
                f"Quantite recue superieure a la quantite commandee pour '{item.description}'."
            )
        if item.product_id:
            if not po.point_of_sale_id:
                raise serializers.ValidationError(
                    {"point_of_sale": "Choisissez le point de vente de destination pour recevoir du stock."}
                )
            if qty != qty.to_integral_value():
                raise serializers.ValidationError(f"Quantite non entiere pour '{item.description}'.")
            stock, _ = Stock.objects.select_for_update().get_or_create(product=item.product, point_of_sale=po.point_of_sale)
            stock.quantity += int(qty)
            stock.save(update_fields=["quantity", "updated_at"])
        item.received_quantity += qty
        item.save(update_fields=["received_quantity"])

    fresh = list(PurchaseOrderItem.objects.filter(purchase_order=po))
    all_received = all(i.received_quantity >= i.quantity for i in fresh)
    any_received = any(i.received_quantity > 0 for i in fresh)
    po.status = (
        PurchaseOrder.Status.RECEIVED if all_received else PurchaseOrder.Status.PARTIAL if any_received else po.status
    )
    po.save(update_fields=["status"])
    return po
