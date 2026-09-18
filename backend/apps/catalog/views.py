from django.http import HttpResponse
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from .excel import export_products_to_excel, import_products_from_excel
from .models import Category, Product
from .serializers import CategorySerializer, ProductSerializer


class IsAdminOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_staff)


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsAdminOrReadOnly]


class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.select_related("category").all()
    serializer_class = ProductSerializer
    permission_classes = [IsAdminOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["category", "is_active"]
    search_fields = ["name", "sku", "description"]
    ordering_fields = ["price", "created_at", "name"]

    def get_queryset(self):
        qs = super().get_queryset()
        if not (self.request.user and self.request.user.is_staff):
            qs = qs.filter(is_active=True)
        return qs

    @action(detail=False, methods=["get"], permission_classes=[permissions.IsAdminUser])
    def export_excel(self, request):
        buffer = export_products_to_excel()
        response = HttpResponse(
            buffer.read(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = 'attachment; filename="produits_labelleteranga.xlsx"'
        return response

    @action(
        detail=False,
        methods=["post"],
        permission_classes=[permissions.IsAdminUser],
        parser_classes=[MultiPartParser],
    )
    def import_excel(self, request):
        file_obj = request.FILES.get("file")
        if not file_obj:
            return Response({"detail": "Aucun fichier fourni."}, status=status.HTTP_400_BAD_REQUEST)
        summary = import_products_from_excel(file_obj)
        return Response(summary, status=status.HTTP_200_OK)
