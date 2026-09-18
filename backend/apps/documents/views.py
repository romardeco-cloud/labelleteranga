from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .models import (
    Customer,
    Invoice,
    InvoiceItem,
    InvoicePayment,
    PurchaseOrder,
    PurchaseOrderPayment,
    Quote,
    Supplier,
    next_number,
)
from .serializers import (
    CustomerSerializer,
    InvoicePaymentSerializer,
    InvoiceSerializer,
    PurchaseOrderPaymentSerializer,
    PurchaseOrderSerializer,
    QuoteSerializer,
    SupplierSerializer,
    deduct_invoice_stock,
    receive_purchase_order,
    restore_invoice_stock,
)


class AdminOnly(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAdminUser]


class CustomerViewSet(AdminOnly):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        q = self.request.query_params.get("search")
        return qs.filter(Q(name__icontains=q) | Q(phone__icontains=q)) if q else qs


class SupplierViewSet(AdminOnly):
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        q = self.request.query_params.get("search")
        return qs.filter(Q(name__icontains=q) | Q(phone__icontains=q)) if q else qs


class DocumentViewSet(AdminOnly):
    """Filtres communs : ?start=&end=&status=&point_of_sale=&search=&party=<id>"""

    party_field = "customer"
    pdf_kind = "Document"

    @action(detail=True, methods=["get"], url_path="pdf")
    def pdf(self, request, pk=None):
        """GET /api/documents/<type>/<id>/pdf/ : le document au format PDF (impression / envoi au client)."""
        from apps.reports.pdf import document_pdf

        obj = self.get_object()
        return document_pdf(self.pdf_kind, obj, self.get_serializer(obj).data)

    def get_queryset(self):
        qs = super().get_queryset().select_related(self.party_field, "point_of_sale").prefetch_related("items")
        p = self.request.query_params
        if p.get("start"):
            qs = qs.filter(date__gte=p["start"])
        if p.get("end"):
            qs = qs.filter(date__lte=p["end"])
        if p.get("status"):
            qs = qs.filter(status=p["status"])
        if p.get("point_of_sale"):
            qs = qs.filter(point_of_sale_id=p["point_of_sale"])
        if p.get("party"):
            qs = qs.filter(**{f"{self.party_field}_id": p["party"]})
        if p.get("search"):
            qs = qs.filter(Q(number__icontains=p["search"]) | Q(**{f"{self.party_field}__name__icontains": p["search"]}))
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class QuoteViewSet(DocumentViewSet):
    pdf_kind = "Devis"
    queryset = Quote.objects.all()
    serializer_class = QuoteSerializer

    def destroy(self, request, *args, **kwargs):
        if hasattr(self.get_object(), "invoice"):
            raise ValidationError("Ce devis est lie a une facture : suppression impossible.")
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"], url_path="convert-to-invoice")
    @transaction.atomic
    def convert_to_invoice(self, request, pk=None):
        quote = self.get_object()
        if hasattr(quote, "invoice"):
            raise ValidationError("Ce devis a deja ete transforme en facture.")
        if quote.status == Quote.Status.REJECTED:
            raise ValidationError("Un devis refuse ne peut pas etre facture.")
        due = request.data.get("due_date") or (timezone.localdate() + timedelta(days=30))
        invoice = Invoice.objects.create(
            number=next_number("invoice", "FAC"),
            customer=quote.customer,
            point_of_sale=quote.point_of_sale,
            tax_rate=quote.tax_rate,
            payment_method=quote.payment_method,
            notes=quote.notes,
            due_date=due,
            source_quote=quote,
            created_by=request.user,
        )
        InvoiceItem.objects.bulk_create(
            [
                InvoiceItem(
                    invoice=invoice,
                    product=i.product,
                    description=i.description,
                    quantity=i.quantity,
                    unit_price=i.unit_price,
                    discount_percent=i.discount_percent,
                )
                for i in quote.items.all()
            ]
        )
        if request.data.get("deduct_stock"):
            deduct_invoice_stock(invoice, user=request.user)
        quote.status = Quote.Status.ACCEPTED
        quote.save(update_fields=["status"])
        return Response(InvoiceSerializer(invoice).data, status=status.HTTP_201_CREATED)


def _add_payment(document, serializer_cls, model_cls, fk_name, request):
    serializer = serializer_cls(data=request.data)
    serializer.is_valid(raise_exception=True)
    amount = serializer.validated_data["amount"]
    if amount <= 0:
        raise ValidationError({"amount": "Le montant doit etre positif."})
    if amount > document.balance:
        raise ValidationError({"amount": f"Le montant depasse le solde restant ({document.balance})."})
    serializer.save(**{fk_name: document}, created_by=request.user)
    return document


class InvoiceViewSet(DocumentViewSet):
    pdf_kind = "Facture"
    queryset = Invoice.objects.all()
    serializer_class = InvoiceSerializer

    def get_queryset(self):
        qs = super().get_queryset().prefetch_related("payments")
        pay = self.request.query_params.get("payment_status")
        if pay:
            ids = [i.id for i in qs if i.payment_status == pay]
            qs = qs.filter(id__in=ids)
        return qs

    def destroy(self, request, *args, **kwargs):
        raise ValidationError("Une facture ne se supprime pas : annulez-la.")

    @action(detail=True, methods=["post"], url_path="add-payment")
    @transaction.atomic
    def add_payment(self, request, pk=None):
        invoice = self.get_object()
        if invoice.status == Invoice.Status.CANCELLED:
            raise ValidationError("Facture annulee.")
        _add_payment(invoice, InvoicePaymentSerializer, InvoicePayment, "invoice", request)
        return Response(InvoiceSerializer(self.get_object()).data)

    @action(detail=True, methods=["post"], url_path="remove-payment")
    @transaction.atomic
    def remove_payment(self, request, pk=None):
        invoice = self.get_object()
        invoice.payments.filter(pk=request.data.get("payment_id")).delete()
        return Response(InvoiceSerializer(self.get_object()).data)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def cancel(self, request, pk=None):
        invoice = self.get_object()
        if invoice.status == Invoice.Status.CANCELLED:
            raise ValidationError("Facture deja annulee.")
        if invoice.payments.exists():
            raise ValidationError("Supprimez d'abord les paiements enregistres avant d'annuler cette facture.")
        if invoice.stock_deducted:
            restore_invoice_stock(invoice, user=request.user)
        invoice.status = Invoice.Status.CANCELLED
        invoice.save(update_fields=["status"])
        return Response(InvoiceSerializer(invoice).data)


class PurchaseOrderViewSet(DocumentViewSet):
    pdf_kind = "Bon de commande"
    queryset = PurchaseOrder.objects.all()
    serializer_class = PurchaseOrderSerializer
    party_field = "supplier"

    def get_queryset(self):
        qs = super().get_queryset().prefetch_related("payments")
        pay = self.request.query_params.get("payment_status")
        if pay:
            ids = [i.id for i in qs if i.payment_status == pay]
            qs = qs.filter(id__in=ids)
        return qs

    def destroy(self, request, *args, **kwargs):
        po = self.get_object()
        if po.items.filter(received_quantity__gt=0).exists() or po.payments.exists():
            raise ValidationError("Bon de commande avec receptions ou paiements : annulez-le plutot.")
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"])
    @transaction.atomic
    def receive(self, request, pk=None):
        po = self.get_object()
        po = receive_purchase_order(po, request.data.get("items", []), user=request.user)
        return Response(PurchaseOrderSerializer(self.get_object()).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        po = self.get_object()
        if po.items.filter(received_quantity__gt=0).exists():
            raise ValidationError("Des articles ont deja ete recus : annulation impossible.")
        po.status = PurchaseOrder.Status.CANCELLED
        po.save(update_fields=["status"])
        return Response(PurchaseOrderSerializer(po).data)

    @action(detail=True, methods=["post"], url_path="add-payment")
    @transaction.atomic
    def add_payment(self, request, pk=None):
        po = self.get_object()
        _add_payment(po, PurchaseOrderPaymentSerializer, PurchaseOrderPayment, "purchase_order", request)
        return Response(PurchaseOrderSerializer(self.get_object()).data)

    @action(detail=True, methods=["post"], url_path="remove-payment")
    @transaction.atomic
    def remove_payment(self, request, pk=None):
        po = self.get_object()
        po.payments.filter(pk=request.data.get("payment_id")).delete()
        return Response(PurchaseOrderSerializer(self.get_object()).data)
