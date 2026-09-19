from django.db.models import Count, Max, Q, Sum
from django.http import HttpResponse
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .inventory import (
    create_inventory,
    ensure_draft,
    export_counting_sheet,
    import_counts,
    set_counts,
    validate_inventory,
)
from apps.catalog.models import Category

from .models import InventoryCount, PointOfSale, Stock, StockMovement, StoreCategory, get_settings
from .serializers import (
    InventoryCountDetailSerializer,
    InventoryCountSerializer,
    PointOfSaleSerializer,
    SetStockSerializer,
    StockMovementSerializer,
    StockSerializer,
    StoreCategorySerializer,
    StoreSettingsSerializer,
    store_config,
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

    @action(detail=True, methods=["get", "patch"], permission_classes=[permissions.IsAdminUser], url_path="settings")
    def config(self, request, pk=None):
        """GET/PATCH /api/stores/points-of-sale/<id>/settings/ : identite, coordonnees, legal, finances, ticket, modules."""
        store = self.get_object()
        if request.method == "PATCH":
            base = PointOfSaleSerializer(store, data=request.data, partial=True)
            base.is_valid(raise_exception=True)
            extra = StoreSettingsSerializer(get_settings(store), data=request.data, partial=True)
            extra.is_valid(raise_exception=True)
            base.save()
            extra.save()
        return Response(store_config(store))


class StoreCategoryViewSet(viewsets.ModelViewSet):
    """
    Categories par point de vente. GET ?point_of_sale=<id>. POST {point_of_sale, category: <id> | name: "..."}
    (cree la categorie si le nom est nouveau). PATCH {order}. DELETE : retire la categorie du point de vente
    (la categorie et ses produits ne sont pas supprimes).
    """

    queryset = StoreCategory.objects.select_related("category", "point_of_sale")
    serializer_class = StoreCategorySerializer
    permission_classes = [permissions.IsAdminUser]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def _annotate(self, links):
        stats = {}
        stores = {l.point_of_sale_id for l in links}
        # actifs = visibles en caisse ; masques (is_active = non) = comptes dans la categorie mais absents de la caisse
        for row in (
            Stock.objects.filter(point_of_sale_id__in=stores)
            .values("point_of_sale_id", "product__category_id", "product__is_active")
            .annotate(n=Count("id"), qty=Sum("quantity"))
        ):
            key = (row["point_of_sale_id"], row["product__category_id"])
            active, hidden, qty = stats.get(key, (0, 0, 0))
            if row["product__is_active"]:
                active, qty = active + row["n"], qty + (row["qty"] or 0)
            else:
                hidden += row["n"]
            stats[key] = (active, hidden, qty)
        for l in links:
            l.products_count, l.hidden_count, l.stock_total = stats.get((l.point_of_sale_id, l.category_id), (0, 0, 0))
        return links

    def get_queryset(self):
        qs = super().get_queryset()
        store = self.request.query_params.get("point_of_sale")
        return qs.filter(point_of_sale_id=store) if store else qs

    def list(self, request, *args, **kwargs):
        links = self._annotate(list(self.filter_queryset(self.get_queryset())))
        return Response(StoreCategorySerializer(links, many=True).data)

    def create(self, request, *args, **kwargs):
        try:
            store = PointOfSale.objects.get(pk=request.data.get("point_of_sale"))
        except (PointOfSale.DoesNotExist, ValueError, TypeError):
            raise ValidationError({"point_of_sale": "Point de vente introuvable."})
        if request.data.get("category"):
            category = Category.objects.filter(pk=request.data["category"]).first()
            if not category:
                raise ValidationError({"category": "Categorie introuvable."})
        else:
            name = (request.data.get("name") or "").strip()
            if not name:
                raise ValidationError({"name": "Indiquez le nom de la categorie."})
            category = Category.objects.filter(name__iexact=name).first() or Category.objects.create(name=name)
        if StoreCategory.objects.filter(point_of_sale=store, category=category).exists():
            raise ValidationError({"name": "Cette categorie existe deja pour ce point de vente."})
        last = StoreCategory.objects.filter(point_of_sale=store).aggregate(m=Max("order"))["m"]
        link = StoreCategory.objects.create(
            point_of_sale=store, category=category, order=int(request.data.get("order", (last or 0) + 1 if last is not None else 0))
        )
        return Response(StoreCategorySerializer(self._annotate([link])[0]).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        link = self.get_object()
        try:
            link.order = max(0, int(request.data.get("order", link.order)))
        except (TypeError, ValueError):
            raise ValidationError({"order": "Nombre entier attendu."})
        link.save(update_fields=["order"])
        return Response(StoreCategorySerializer(self._annotate([link])[0]).data)


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

    @action(detail=True, methods=["get"], url_path="pdf")
    def pdf(self, request, pk=None):
        from apps.reports.pdf import inventory_pdf

        return inventory_pdf(self.get_object())

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


def _available_online_methods(enabled):
    """Moyens proposes sur le site : actives pour le point de vente ET reellement configures sur le serveur (cles API)."""
    from django.conf import settings as dj

    configured = {
        "cash": True,
        "card": bool(dj.STRIPE_SECRET_KEY),
        "wave": bool(dj.WAVE_API_KEY),
        "orange_money": bool(dj.ORANGE_MONEY_CLIENT_ID and dj.ORANGE_MONEY_CLIENT_SECRET and dj.ORANGE_MONEY_MERCHANT_KEY),
    }
    # Wave / Orange Money sans API marchand : paiement par QR code, confirme a la main par l'equipe
    manual = [m for m in ("wave", "orange_money") if m in enabled and not configured[m]]
    return [m for m in enabled if configured.get(m) or m in manual], manual


def _site_payload(store, with_categories=False):
    st = get_settings(store)
    data = {
        "id": store.id,
        "name": store.name,
        "slug": store.slug,
        "description": store.description,
        "address": store.address,
        "phone": store.phone,
        "email": st.email or "info@labelleteranga.com",
    }
    data["payment_methods"], data["manual_payment_methods"] = _available_online_methods(st.payment_methods)
    if with_categories:
        counts = {
            r["product__category_id"]: r["n"]
            for r in Stock.objects.filter(point_of_sale=store, product__is_active=True, quantity__gt=0)
            .values("product__category_id")
            .annotate(n=Count("id"))
        }
        data["categories"] = [
            {"id": l.category_id, "name": l.category.name, "order": l.order, "products_count": counts.get(l.category_id, 0)}
            for l in StoreCategory.objects.filter(point_of_sale=store).select_related("category")
            if counts.get(l.category_id, 0) > 0
        ]
    return data


class SiteListView(APIView):
    """GET /api/stores/sites/ : points de vente ayant un site web en ligne (public)."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        stores = PointOfSale.objects.filter(online_enabled=True, is_active=True, slug__isnull=False).order_by("name")
        return Response([_site_payload(s) for s in stores])


class SiteDetailView(APIView):
    """GET /api/stores/sites/<slug>/ : fiche publique d'un site (nom, coordonnees, categories disponibles)."""

    permission_classes = [permissions.AllowAny]

    def get(self, request, slug):
        try:
            store = PointOfSale.objects.get(slug=slug, online_enabled=True, is_active=True)
        except PointOfSale.DoesNotExist:
            return Response({"detail": "Site introuvable."}, status=status.HTTP_404_NOT_FOUND)
        return Response(_site_payload(store, with_categories=True))
