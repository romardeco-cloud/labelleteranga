from django.db.models import Q
from django.http import HttpResponse
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from .inventory import (
    create_inventory,
    ensure_draft,
    export_counting_sheet,
    import_counts,
    set_counts,
    validate_inventory,
)
from .models import InventoryCount, PointOfSale, Stock, StockMovement
from .serializers import (
    InventoryCountDetailSerializer,
    InventoryCountSerializer,
    PointOfSaleSerializer,
    SetStockSerializer,
    StockMovementSerializer,
    StockSerializer,
)
from .services import change_stock


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
        change_stock(
            serializer.validated_data["product"],
            serializer.validated_data["point_of_sale"],
            set_to=serializer.validated_data["quantity"],
            reason=StockMovement.Reason.MANUAL,
            user=request.user,
        )
        stock, _ = Stock.objects.get_or_create(
            product=serializer.validated_data["product"], point_of_sale=serializer.validated_data["point_of_sale"]
        )
        return Response(StockSerializer(stock).data, status=status.HTTP_200_OK)


class StockMovementViewSet(viewsets.ReadOnlyModelViewSet):
    """Journal des mouvements. Filtres : product, point_of_sale, reason, start, end, search."""

    queryset = StockMovement.objects.select_related("product", "point_of_sale", "user")
    serializer_class = StockMovementSerializer
    permission_classes = [permissions.IsAdminUser]

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get("product"):
            qs = qs.filter(product_id=p["product"])
        if p.get("point_of_sale"):
            qs = qs.filter(point_of_sale_id=p["point_of_sale"])
        if p.get("reason"):
            qs = qs.filter(reason=p["reason"])
        if p.get("start"):
            qs = qs.filter(created_at__date__gte=p["start"])
        if p.get("end"):
            qs = qs.filter(created_at__date__lte=p["end"])
        if p.get("search"):
            qs = qs.filter(
                Q(product__name__icontains=p["search"])
                | Q(product__sku__icontains=p["search"])
                | Q(reference__icontains=p["search"])
            )
        return qs


class InventoryCountViewSet(viewsets.ModelViewSet):
    queryset = InventoryCount.objects.select_related("point_of_sale", "created_by").prefetch_related(
        "lines__product"
    )
    permission_classes = [permissions.IsAdminUser]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_serializer_class(self):
        return InventoryCountDetailSerializer if self.action == "retrieve" else InventoryCountSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get("point_of_sale"):
            qs = qs.filter(point_of_sale_id=p["point_of_sale"])
        if p.get("status"):
            qs = qs.filter(status=p["status"])
        return qs

    def _fresh(self, count):
        return self.get_queryset().get(pk=count.pk)

    def _detail(self, count, **extra):
        return Response({**InventoryCountDetailSerializer(self._fresh(count)).data, **extra})

    def create(self, request, *args, **kwargs):
        serializer = InventoryCountSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        count = create_inventory(
            serializer.validated_data["point_of_sale"],
            serializer.validated_data["date"],
            notes=serializer.validated_data.get("notes", ""),
            category=request.data.get("category") or None,
            user=request.user,
        )
        return Response(InventoryCountSerializer(self._fresh(count)).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        count = self.get_object()
        ensure_draft(count)
        count.notes = request.data.get("notes", count.notes)
        count.save(update_fields=["notes"])
        return self._detail(count)

    def destroy(self, request, *args, **kwargs):
        if self.get_object().status == InventoryCount.Status.VALIDATED:
            raise ValidationError("Un inventaire valide ne se supprime pas.")
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["post"], url_path="set-counts")
    def set_counts_action(self, request, pk=None):
        count = self.get_object()
        set_counts(count, request.data.get("counts", []))
        return self._detail(count)

    @action(detail=True, methods=["get"])
    def export(self, request, pk=None):
        count = self.get_object()
        response = HttpResponse(
            export_counting_sheet(count).getvalue(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = f'attachment; filename="feuille_comptage_{count.number}.xlsx"'
        return response

    @action(detail=True, methods=["post"], url_path="import-counts", parser_classes=[MultiPartParser])
    def import_counts_action(self, request, pk=None):
        count = self.get_object()
        upload = request.FILES.get("file")
        if not upload:
            raise ValidationError("Aucun fichier envoye.")
        result = import_counts(count, upload)
        return self._detail(count, import_result=result)

    @action(detail=True, methods=["post"])
    def validate(self, request, pk=None):
        count, moved = validate_inventory(self.get_object(), user=request.user)
        return self._detail(count, moved_since_snapshot=moved)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        count = self.get_object()
        ensure_draft(count)
        count.status = InventoryCount.Status.CANCELLED
        count.save(update_fields=["status"])
        return self._detail(count)
