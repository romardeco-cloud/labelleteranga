from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import PointOfSale, Stock
from .serializers import PointOfSaleSerializer, SetStockSerializer, StockSerializer


class IsAdminOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_staff)


class PointOfSaleViewSet(viewsets.ModelViewSet):
    queryset = PointOfSale.objects.all()
    serializer_class = PointOfSaleSerializer
    permission_classes = [IsAdminOrReadOnly]


class StockViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET /api/stores/stock/                 - matrice complete (tous produits x tous points de vente)
    GET /api/stores/stock/?product=<id>    - filtre par produit
    POST /api/stores/stock/set/            - cree ou met a jour la quantite pour (produit, point de vente)
    """

    queryset = Stock.objects.select_related("product", "point_of_sale").all()
    serializer_class = StockSerializer
    permission_classes = [permissions.IsAdminUser]

    def get_queryset(self):
        qs = super().get_queryset()
        product_id = self.request.query_params.get("product")
        if product_id:
            qs = qs.filter(product_id=product_id)
        return qs

    @action(detail=False, methods=["post"])
    def set(self, request):
        serializer = SetStockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        stock, _ = Stock.objects.update_or_create(
            product=serializer.validated_data["product"],
            point_of_sale=serializer.validated_data["point_of_sale"],
            defaults={"quantity": serializer.validated_data["quantity"]},
        )
        return Response(StockSerializer(stock).data, status=status.HTTP_200_OK)
