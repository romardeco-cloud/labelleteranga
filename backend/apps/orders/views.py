from rest_framework import mixins, permissions, viewsets

from .models import Order
from .serializers import OrderSerializer


class OrderViewSet(mixins.RetrieveModelMixin, mixins.ListModelMixin, viewsets.GenericViewSet):
    queryset = Order.objects.prefetch_related("items").all()
    serializer_class = OrderSerializer
    lookup_field = "reference"

    def get_permissions(self):
        if self.action == "list":
            return [permissions.IsAdminUser()]
        return [permissions.AllowAny()]
