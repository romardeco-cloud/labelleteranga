from django.db import transaction
from django.db.models import Avg, Count, Max, Q, Sum
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

from .loyalty import reward_text as loyalty_reward_text
from .models import Combo, Review, DailyMenu, DailyMenuItem, InventoryCount, PointOfSale, Stock, StockMovement, StoreCategory, get_settings
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

    def perform_create(self, serializer):
        from .services import bootstrap_store

        store = serializer.save()
        bootstrap_store(store)

    def destroy(self, request, *args, **kwargs):
        """
        Suppression complete d'un point de vente (stocks, categories, parametres, menus, avis, fidelite, combos, caissiers).
        Les ventes passees sont conservees mais ne sont plus rattachees a un point de vente.
        Il faut renvoyer le nom exact du point de vente (?confirm_name=...) ; sans cela, la reponse decrit ce qui sera supprime.
        """
        from django.contrib.auth.models import User

        from apps.accounts.models import CashierProfile
        from apps.orders.models import Order

        store = self.get_object()
        impact = {
            "products": store.stocks.count(),
            "cashiers": store.cashiers.count(),
            "orders": Order.objects.filter(point_of_sale=store).count(),
            "reviews": store.reviews.count(),
            "loyalty_members": store.loyalty_members.count(),
        }
        if request.query_params.get("confirm_name", "").strip() != store.name:
            return Response(
                {"detail": "Confirmation requise : saisissez le nom exact du point de vente.", "impact": impact},
                status=status.HTTP_409_CONFLICT,
            )
        with transaction.atomic():
            cashier_ids = list(store.cashiers.values_list("user_id", flat=True))
            CashierProfile.objects.filter(point_of_sale=store).delete()
            User.objects.filter(pk__in=cashier_ids, is_staff=False, is_superuser=False).delete()
            store.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    # ---- remise a zero avant le demarrage officiel ------------------------------------------------
    @action(detail=True, methods=["get"], permission_classes=[permissions.IsAdminUser], url_path="reset-preview")
    def reset_preview(self, request, pk=None):
        """GET : ce que la remise a zero supprimerait pour ce point de vente (aucune modification)."""
        from .reset import counts

        return Response({"name": self.get_object().name, "counts": counts(self.get_object())})

    @action(detail=True, methods=["get"], permission_classes=[permissions.IsAdminUser], url_path="reset-backup")
    def reset_backup(self, request, pk=None):
        """GET : sauvegarde Excel des transactions du point de vente (a telecharger avant la remise a zero)."""
        from django.utils import timezone

        from .reset import backup_xlsx

        store = self.get_object()
        response = HttpResponse(
            backup_xlsx(store), content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        response["Content-Disposition"] = f'attachment; filename="sauvegarde_{store.slug or store.pk}_{timezone.localdate():%Y%m%d}.xlsx"'
        return response

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAdminUser], url_path="reset-data")
    def reset_data(self, request, pk=None):
        """
        POST {pin, confirm_name, include_stock_levels?} : supprime TOUTES les transactions du point de vente (ventes, clotures, documents,
        mouvements de stock, avis, fidelite...). Produits, prix, categories, parametres, caissiers et menus sont conserves.
        Exige le code secret a 4 chiffres et la saisie exacte du nom du point de vente.
        """
        from apps.accounts.models import AdminSecurityCode

        from .reset import reset_store

        store = self.get_object()
        if str(request.data.get("confirm_name", "")).strip() != store.name:
            raise ValidationError({"confirm_name": "Saisissez exactement le nom du point de vente."})
        AdminSecurityCode.current().verify(str(request.data.get("pin") or ""))
        done = reset_store(store, include_stock_levels=str(request.data.get("include_stock_levels", "")).lower() in ("1", "true", "yes"))
        return Response({"reset": True, "deleted": done})

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
    data["wave_pay_url"] = st.wave_pay_url
    data["orange_pay_url"] = st.orange_pay_url
    data["wave_number"] = st.wave_number
    data["orange_number"] = st.orange_number
    data["social_links"] = st.social_links or {}
    data["rccm"] = st.rccm
    data["ninea"] = st.ninea
    data["loyalty"] = (
        {
            "enabled": True,
            "mode": st.loyalty_mode,
            "threshold": st.loyalty_threshold,
            "reward_label": loyalty_reward_text(st),
        }
        if st.loyalty_enabled
        else {"enabled": False}
    )
    rev = Review.objects.filter(point_of_sale=store, is_published=True).aggregate(n=Count("id"), s=Avg("service_rating"), q=Avg("quality_rating"))
    data["reviews"] = {"count": rev["n"], "overall": round(((rev["s"] or 0) + (rev["q"] or 0)) / 2, 1) if rev["n"] else None}
    data["combos_count"] = Combo.objects.filter(point_of_sale=store, is_active=True).count()
    if with_categories:
        from .models import tracks_stock

        in_sale = Stock.objects.filter(point_of_sale=store, product__is_active=True, product__category__isnull=False)
        if tracks_stock(store):
            in_sale = in_sale.filter(quantity__gt=0)
        counts = {r["product__category_id"]: r["n"] for r in in_sale.values("product__category_id").annotate(n=Count("id"))}
        links = {l.category_id: l for l in StoreCategory.objects.filter(point_of_sale=store).select_related("category")}
        names = {c.pk: c.name for c in Category.objects.filter(pk__in=counts)}
        data["categories"] = sorted(
            (
                {
                    "id": cid,
                    "name": links[cid].category.name if cid in links else names.get(cid, ""),
                    "order": links[cid].order if cid in links else 999,
                    "products_count": n,
                }
                for cid, n in counts.items()
            ),
            key=lambda c: (c["order"], c["name"]),
        )
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


DEFAULT_TITLES = {"lunch": "Menu du midi", "special": "Speciaux du jour"}


def _menu_payload(menu, request=None):
    from apps.catalog.serializers import ProductSerializer

    ctx = {"store": menu.point_of_sale, "request": request}
    items = menu.items.select_related("product__category").prefetch_related("product__stocks__point_of_sale")
    return {
        "id": menu.id,
        "date": menu.date,
        "kind": menu.kind,
        "title": menu.title or DEFAULT_TITLES[menu.kind],
        "note": menu.note,
        "is_published": menu.is_published,
        "items": [
            {
                "number": i.number,
                "special_price": i.special_price,
                "product": ProductSerializer(i.product, context=ctx).data,
            }
            for i in items
            if i.product.is_active
        ],
    }


class SiteDailyMenuView(APIView):
    """GET /api/stores/sites/<slug>/menu/ : {lunch, special} publies pour aujourd'hui (null si absent)."""

    permission_classes = [permissions.AllowAny]

    def get(self, request, slug):
        from django.utils import timezone

        store = PointOfSale.objects.filter(slug=slug, online_enabled=True, is_active=True).first()
        if not store:
            return Response({"detail": "Site introuvable."}, status=status.HTTP_404_NOT_FOUND)
        out = {"lunch": None, "special": None}
        for menu in DailyMenu.objects.filter(point_of_sale=store, date=timezone.localdate(), is_published=True):
            data = _menu_payload(menu, request)
            out[menu.kind] = data if data["items"] else None
        return Response(out)


class DailyMenuAdminView(APIView):
    """
    GET    ?point_of_sale=<id>&date=YYYY-MM-DD&kind=lunch|special -> {menu, previous: [...]}
    POST   {point_of_sale, date, kind, title, note, is_published, items: [{product, special_price?}, ...]}
           remplace la selection ; les numeros de choix suivent l'ordre de la liste (1, 2, 3...)
    DELETE ?point_of_sale=&date=&kind= : retire la selection de ce jour
    """

    permission_classes = [permissions.IsAdminUser]

    def _params(self, data):
        from datetime import date as date_cls

        from django.utils import timezone

        try:
            store = PointOfSale.objects.get(pk=data.get("point_of_sale"))
        except (PointOfSale.DoesNotExist, ValueError, TypeError):
            raise ValidationError({"point_of_sale": "Point de vente introuvable."})
        try:
            day = date_cls.fromisoformat(data["date"]) if data.get("date") else timezone.localdate()
        except ValueError:
            raise ValidationError({"date": "Date invalide."})
        kind = data.get("kind") or "lunch"
        if kind not in ("lunch", "special"):
            raise ValidationError({"kind": "Type inconnu."})
        return store, day, kind

    def get(self, request):
        store, day, kind = self._params(request.query_params)
        menu = DailyMenu.objects.filter(point_of_sale=store, date=day, kind=kind).first()
        previous = DailyMenu.objects.filter(point_of_sale=store, date__lt=day, kind=kind, items__isnull=False).distinct().first()
        return Response(
            {
                "menu": _menu_payload(menu, request) if menu else None,
                "previous": (
                    [{"product": i.product_id, "special_price": i.special_price} for i in previous.items.all()] if previous else []
                ),
                "previous_date": previous.date if previous else None,
            }
        )

    def post(self, request):
        from decimal import Decimal, InvalidOperation

        from apps.catalog.models import Product

        store, day, kind = self._params(request.data)
        raw = request.data.get("items") or []
        if not isinstance(raw, list):
            raise ValidationError({"items": "Liste attendue."})
        entries, seen = [], set()
        for it in raw:
            pid = int(it["product"] if isinstance(it, dict) else it)
            if pid in seen:
                continue
            seen.add(pid)
            price = None
            if isinstance(it, dict) and it.get("special_price") not in (None, ""):
                try:
                    price = Decimal(str(it["special_price"]))
                except InvalidOperation:
                    raise ValidationError({"items": "Prix special invalide."})
                if price < 0:
                    raise ValidationError({"items": "Prix special invalide."})
            entries.append((pid, price if kind == "special" else None))
        valid = set(Product.objects.filter(pk__in=[e[0] for e in entries], stocks__point_of_sale=store).values_list("pk", flat=True))
        if any(pid not in valid for pid, _ in entries):
            raise ValidationError({"items": "Certains produits ne sont pas rattaches a ce point de vente."})
        menu, _ = DailyMenu.objects.get_or_create(point_of_sale=store, date=day, kind=kind)
        menu.title = (request.data.get("title") or "")[:80]
        menu.note = (request.data.get("note") or "")[:160]
        menu.is_published = bool(request.data.get("is_published", True))
        menu.save()
        menu.items.all().delete()
        DailyMenuItem.objects.bulk_create(
            [DailyMenuItem(menu=menu, product_id=pid, number=n, special_price=price) for n, (pid, price) in enumerate(entries, start=1)]
        )
        return Response(_menu_payload(menu, request))

    def delete(self, request):
        store, day, kind = self._params(request.query_params)
        DailyMenu.objects.filter(point_of_sale=store, date=day, kind=kind).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
