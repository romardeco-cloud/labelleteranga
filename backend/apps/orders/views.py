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
        if self.action in ("list", "update", "partial_update", "void"):
            return [permissions.IsAdminUser()]
        return [permissions.AllowAny()]

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
