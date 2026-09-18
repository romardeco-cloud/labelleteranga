from rest_framework import mixins, permissions, viewsets

from .models import Order
from .serializers import OrderSerializer


class OrderViewSet(
    mixins.RetrieveModelMixin, mixins.ListModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet
):
    queryset = Order.objects.select_related("point_of_sale").prefetch_related("items").all()
    serializer_class = OrderSerializer
    lookup_field = "reference"

    def get_permissions(self):
        if self.action in ("list", "update", "partial_update"):
            return [permissions.IsAdminUser()]
        return [permissions.AllowAny()]
