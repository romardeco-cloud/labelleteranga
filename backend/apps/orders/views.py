from django.utils import timezone
from rest_framework import mixins, permissions, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.accounts.models import AdminSecurityCode
from apps.accounts.permissions import IsCashier

from .models import Order
from .services import change_order_payment_method, void_order
from .services import confirm_correction as apply_confirmed_correction
from .services import reject_correction as apply_rejected_correction
from .services import request_correction
from .serializers import OrderSerializer


class OrderViewSet(
    mixins.RetrieveModelMixin, mixins.ListModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet
):
    queryset = Order.objects.select_related("point_of_sale").prefetch_related("items").all()
    serializer_class = OrderSerializer
    lookup_field = "reference"

    def get_permissions(self):
        if self.action in ("list", "update", "partial_update", "bulk_delete", "confirm_correction", "reject_correction", "pending_corrections"):
            return [permissions.IsAdminUser()]
        if self.action in ("void", "change_payment"):
            return [(permissions.IsAdminUser | IsCashier)()]
        return [permissions.AllowAny()]

    def _check_cashier_owns_today(self, request, order):
        """Un caissier ne peut demander une correction que sur SA PROPRE vente du jour en caisse."""
        if (
            order.channel != Order.Channel.POS
            or order.cashier_id != request.user.id
            or not order.paid_at
            or order.paid_at.date() != timezone.localdate()
        ):
            raise PermissionDenied("Vous ne pouvez agir que sur vos propres ventes du jour.")

    @action(detail=False, methods=["post"], permission_classes=[permissions.IsAdminUser], url_path="bulk-delete")
    def bulk_delete(self, request):
        """
        POST /api/orders/bulk-delete/ {references: [...], include_declared?: bool} : supprime definitivement des commandes en ligne
        NON FINALISEES (en attente ou echouees). Une commande payee ou annulee (comptabilite) n'est jamais supprimee ici.
        Les commandes dont le client a declare un paiement Wave / Orange Money sont conservees, sauf include_declared=true.
        Une recompense fidelite utilisee sur une commande supprimee est rendue au client.
        """
        from django.db import transaction

        refs = request.data.get("references") or []
        if not isinstance(refs, list) or not refs:
            raise ValidationError({"references": "Selectionnez au moins une commande."})
        include_declared = bool(request.data.get("include_declared"))
        qs = Order.objects.filter(reference__in=[str(r) for r in refs], channel=Order.Channel.ONLINE).exclude(
            status__in=[Order.Status.PAID, Order.Status.CANCELLED]
        )
        deletable = qs if include_declared else qs.filter(payment_declared_at__isnull=True)
        deleted = 0
        with transaction.atomic():
            from apps.stores.models import LoyaltyReward

            for order in list(deletable):
                LoyaltyReward.objects.filter(used_on_order=order.reference[:40]).update(used_at=None, used_on_order="")
                order.delete()
                deleted += 1
        return Response({"deleted": deleted, "skipped": len(refs) - deleted})

    @action(detail=False, methods=["get"], url_path="pending-corrections")
    def pending_corrections(self, request):
        """GET /api/orders/pending-corrections/ : ventes avec une demande de caissier en attente de confirmation, plus recentes d'abord."""
        qs = self.get_queryset().exclude(pending_action="").order_by("-pending_requested_at")
        return Response(OrderSerializer(qs, many=True).data)

    @action(detail=True, methods=["post"])
    def void(self, request, reference=None):
        """
        POST /api/orders/<reference>/void/ {pin, reason} : annulation d'une vente validee. Motif et code secret
        a 4 chiffres obligatoires. Avec le code principal, l'administrateur annule directement n'importe quelle
        vente. Avec le code secondaire, un caissier ne fait que DEMANDER l'annulation d'une de ses propres
        ventes du jour : elle n'a aucun effet tant que l'administrateur ne l'a pas confirmee.
        """
        order = self.get_object()
        reason = str(request.data.get("reason") or "").strip()
        if not reason:
            raise ValidationError({"reason": "Indiquez le motif de l'annulation."})
        pin = str(request.data.get("pin") or "")
        if request.user.is_staff:
            AdminSecurityCode.current().verify(pin)
            order = void_order(order, request.user, reason)
        else:
            self._check_cashier_owns_today(request, order)
            AdminSecurityCode.current().verify_secondary(pin)
            order = request_correction(order, request.user, Order.PendingAction.VOID, reason)
        return Response(OrderSerializer(order).data)

    @action(detail=True, methods=["post"], url_path="change-payment")
    def change_payment(self, request, reference=None):
        """
        POST /api/orders/<reference>/change-payment/ {payment_method, pin, reason} : corrige le mode de paiement
        d'une vente deja payee. Motif et code secret a 4 chiffres obligatoires. Avec le code principal,
        l'administrateur corrige directement n'importe quelle vente. Avec le code secondaire, un caissier ne
        fait que DEMANDER la correction d'une de ses propres ventes du jour : elle n'a aucun effet tant que
        l'administrateur ne l'a pas confirmee. Une correction directe (admin) est refusee si la journee de
        caisse concernee est deja cloturee.
        """
        order = self.get_object()
        new_method = str(request.data.get("payment_method") or "")
        if new_method not in {key for key, _ in Order.PaymentMethod.choices}:
            raise ValidationError({"payment_method": "Mode de paiement invalide."})
        reason = str(request.data.get("reason") or "").strip()
        if not reason:
            raise ValidationError({"reason": "Indiquez le motif de la correction."})
        pin = str(request.data.get("pin") or "")
        if request.user.is_staff:
            AdminSecurityCode.current().verify(pin)
            order = change_order_payment_method(order, request.user, new_method, reason)
        else:
            self._check_cashier_owns_today(request, order)
            AdminSecurityCode.current().verify_secondary(pin)
            order = request_correction(order, request.user, Order.PendingAction.CHANGE_PAYMENT, reason, new_payment_method=new_method)
        return Response(OrderSerializer(order).data)

    @action(detail=True, methods=["post"], url_path="confirm-correction")
    def confirm_correction(self, request, reference=None):
        """POST /api/orders/<reference>/confirm-correction/ {pin} : applique (code principal) la demande en attente d'un caissier."""
        order = self.get_object()
        AdminSecurityCode.current().verify(str(request.data.get("pin") or ""))
        order = apply_confirmed_correction(order, request.user)
        return Response(OrderSerializer(order).data)

    @action(detail=True, methods=["post"], url_path="reject-correction")
    def reject_correction(self, request, reference=None):
        """POST /api/orders/<reference>/reject-correction/ : ecarte, sans effet, la demande en attente d'un caissier."""
        order = self.get_object()
        order = apply_rejected_correction(order, request.user)
        return Response(OrderSerializer(order).data)
