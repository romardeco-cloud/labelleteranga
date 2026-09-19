from rest_framework import mixins, permissions, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.accounts.models import AdminSecurityCode

from .models import Order
from .services import void_order
from .serializers import OrderSerializer


class OrderViewSet(
    mixins.RetrieveModelMixin, mixins.ListModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet
):
    queryset = Order.objects.select_related("point_of_sale").prefetch_related("items").all()
    serializer_class = OrderSerializer
    lookup_field = "reference"

    def get_permissions(self):
        if self.action in ("list", "update", "partial_update", "void", "bulk_delete"):
            return [permissions.IsAdminUser()]
        return [permissions.AllowAny()]

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

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAdminUser])
    def void(self, request, reference=None):
        """
        POST /api/orders/<reference>/void/ {pin, reason} : annulation d'une vente validee. Reservee a l'administrateur
        (les caissiers n'ont aucun acces) et soumise au code secret a 4 chiffres.
        """
        order = self.get_object()
        reason = str(request.data.get("reason") or "").strip()
        if not reason:
            raise ValidationError({"reason": "Indiquez le motif de l'annulation."})
        AdminSecurityCode.current().verify(str(request.data.get("pin") or ""))
        order = void_order(order, request.user, reason)
        return Response(OrderSerializer(order).data)
