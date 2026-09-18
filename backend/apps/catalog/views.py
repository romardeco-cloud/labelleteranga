import os

from django.http import HttpResponse
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from apps.stores.models import PointOfSale

from .excel import build_import_template, export_products_to_excel, import_products_from_excel
from .models import Category, Product, Promotion
from .serializers import CategorySerializer, ProductSerializer, PromotionSerializer


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
    queryset = Product.objects.select_related("category").prefetch_related("stocks__point_of_sale").all()
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
        store = self.request.query_params.get("point_of_sale")
        if store:  # produits rattaches a ce point de vente
            qs = qs.filter(stocks__point_of_sale_id=store).distinct()
        site = self.request.query_params.get("store")
        if site:  # site web d'un point de vente : ses produits actifs uniquement
            qs = qs.filter(is_active=True, stocks__point_of_sale__slug=site, stocks__point_of_sale__online_enabled=True).distinct()
        return qs

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        site = self.request.query_params.get("store")
        if site:
            ctx["store"] = PointOfSale.objects.filter(slug=site).first()
        return ctx

    # --- photos : erreurs de stockage lisibles + diagnostic ---------------------------------
    def _save_with_photo_guard(self, serializer, **extra):
        try:
            return serializer.save(**extra)
        except ValidationError:
            raise
        except Exception as exc:  # noqa: BLE001 - erreur du stockage d'images (Cloudinary, disque...)
            if "image" not in self.request.FILES:
                raise
            raise ValidationError(
                {
                    "image": "La photo n'a pas pu etre enregistree : "
                    f"{str(exc)[:200] or exc.__class__.__name__}. "
                    "Verifiez la variable CLOUDINARY_URL sur Render (Admin > Produits affiche l'etat du stockage)."
                }
            )

    def perform_create(self, serializer):
        self._save_with_photo_guard(serializer)

    def perform_update(self, serializer):
        self._save_with_photo_guard(serializer)

    @action(detail=False, methods=["get"], permission_classes=[permissions.IsAdminUser], url_path="image-storage")
    def image_storage(self, request):
        """Etat du stockage des photos : disque local (temporaire) ou Cloudinary (permanent)."""
        if not os.environ.get("CLOUDINARY_URL"):
            return Response(
                {
                    "backend": "local",
                    "ok": False,
                    "detail": "CLOUDINARY_URL n'est pas defini sur le serveur : les photos sont stockees sur le disque "
                    "de Render et seront perdues au prochain deploiement.",
                }
            )
        try:
            import cloudinary
            import cloudinary.api

            cloud = cloudinary.config().cloud_name
            cloudinary.api.ping()
            return Response({"backend": "cloudinary", "ok": True, "cloud_name": cloud, "detail": f"Cloudinary connecte ({cloud})."})
        except Exception as exc:  # noqa: BLE001
            return Response(
                {
                    "backend": "cloudinary",
                    "ok": False,
                    "detail": f"Cloudinary refuse la connexion : {str(exc)[:200]}. Verifiez la valeur de CLOUDINARY_URL "
                    "(cloudinary://CLE:SECRET@NOM_DU_COMPTE, sans espaces ni chevrons).",
                }
            )

    @staticmethod
    def _store_from(value):
        if not value:
            return None
        try:
            return PointOfSale.objects.get(pk=value)
        except (PointOfSale.DoesNotExist, ValueError):
            raise ValidationError({"point_of_sale": "Point de vente introuvable."})

    @action(detail=False, methods=["get"], permission_classes=[permissions.IsAdminUser])
    def export_excel(self, request):
        store = self._store_from(request.query_params.get("point_of_sale"))
        buffer = export_products_to_excel(store=store)
        response = HttpResponse(
            buffer.read(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = 'attachment; filename="produits_labelleteranga.xlsx"'
        return response

    @action(detail=False, methods=["get"], permission_classes=[permissions.IsAdminUser])
    def import_template(self, request):
        store = self._store_from(request.query_params.get("point_of_sale"))
        response = HttpResponse(
            build_import_template(store=store).read(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = 'attachment; filename="modele_import_produits_labelleteranga.xlsx"'
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
        store = self._store_from(request.data.get("point_of_sale"))
        summary = import_products_from_excel(file_obj, store=store)
        return Response(summary, status=status.HTTP_200_OK)


class PromotionViewSet(viewsets.ModelViewSet):
    queryset = Promotion.objects.select_related("category", "point_of_sale").prefetch_related("products").all()
    serializer_class = PromotionSerializer
    permission_classes = [permissions.IsAdminUser]
