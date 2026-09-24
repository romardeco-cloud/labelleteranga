from django.utils import timezone
from rest_framework import mixins, permissions, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.accounts.models import AdminSecurityCode
from apps.accounts.permissions import IsCashier

from .models import Order
from .services import change_order_payment_method, void_order
from .serializers import OrderSerializer


class OrderViewSet(
    mixins.RetrieveModelMixin, mixins.ListModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet
):
    queryset = Order.objects.select_related("point_of_sale").prefetch_related("items").all()
    serializer_class = OrderSerializer
    lookup_field = "reference"

    def get_permissions(self):
        if self.action in ("list", "update", "partial_update", "bulk_delete"):
            return [permissions.IsAdminUser()]
        if self.action in ("void", "change_payment"):
            return [(permissions.IsAdminUser | IsCashier)()]
        return [permissions.AllowAny()]

    def _authorize_cashier_or_admin(self, request, order):
        """
        Admin : code secret principal, sans restriction. Caissier : code secret secondaire (supervise par
        l'administrateur, cf. Parametres > Securite), et seulement pour SES PROPRES ventes du jour en caisse -
        jamais une vente en ligne, une vente plus ancienne ou celle d'un autre caissier.
        """
        pin = str(request.data.get("pin") or "")
        if request.user.is_staff:
            AdminSecurityCode.current().verify(pin)
            return
        if (
            order.channel != Order.Channel.POS
            or order.cashier_id != request.user.id
            or not order.paid_at
            or order.paid_at.date() != timezone.localdate()
        ):
            raise PermissionDenied("Vous ne pouvez agir que sur vos propres ventes du jour.")
        AdminSecurityCode.current().verify_secondary(pin)

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

    @action(detail=True, methods=["post"])
    def void(self, request, reference=None):
        """
        POST /api/orders/<reference>/void/ {pin, reason} : annulation d'une vente validee. Motif et code secret
        a 4 chiffres obligatoires. L'administrateur peut annuler n'importe quelle vente avec le code principal ;
        un caissier ne peut annuler que ses propres ventes du jour en caisse, avec le code secondaire.
        """
        order = self.get_object()
        reason = str(request.data.get("reason") or "").strip()
        if not reason:
            raise ValidationError({"reason": "Indiquez le motif de l'annulation."})
        self._authorize_cashier_or_admin(request, order)
        order = void_order(order, request.user, reason)
        return Response(OrderSerializer(order).data)

    @action(detail=True, methods=["post"], url_path="change-payment")
    def change_payment(self, request, reference=None):
        """
        POST /api/orders/<reference>/change-payment/ {payment_method, pin, reason} : corrige le mode de paiement
        d'une vente deja payee. Motif et code secret a 4 chiffres obligatoires, comme pour l'annulation.
        L'administrateur peut corriger n'importe quelle vente avec le code principal ; un caissier ne peut
        corriger que ses propres ventes du jour en caisse, avec le code secondaire. Refusee si la journee de
        caisse concernee est deja cloturee.
        """
        order = self.get_object()
        new_method = str(request.data.get("payment_method") or "")
        if new_method not in {key for key, _ in Order.PaymentMethod.choices}:
            raise ValidationError({"payment_method": "Mode de paiement invalide."})
        reason = str(request.data.get("reason") or "").strip()
        if not reason:
            raise ValidationError({"reason": "Indiquez le motif de la correction."})
        self._authorize_cashier_or_admin(request, order)
        order = change_order_payment_method(order, request.user, new_method, reason)
        return Response(OrderSerializer(order).data)
