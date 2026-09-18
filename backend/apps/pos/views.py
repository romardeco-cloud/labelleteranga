from django.db.models import Q
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsCashier
from apps.catalog.models import Product
from apps.orders.models import Order
from apps.stores.models import DrawerOpening, Stock, StoreCategory
from apps.stores.serializers import pos_settings

from django.utils import timezone

from apps.reports.models import DailyClosing
from apps.reports.serializers import DailyClosingSerializer

from .services import cashier_sales_totals, close_cashier_day, create_pos_sale


class POSProductListView(APIView):
    """GET /api/pos/products/?search=... - produits vendables avec le stock du magasin du caissier."""

    permission_classes = [IsCashier]

    def get(self, request):
        store = request.user.cashier_profile.point_of_sale
        # seuls les produits rattaches a ce point de vente (une ligne de stock, meme a 0)
        qs = Product.objects.filter(is_active=True, stocks__point_of_sale=store).select_related("category")
        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(sku__icontains=search))
        qs = qs.order_by("name")[:1000]

        stock_by_product = dict(
            Stock.objects.filter(point_of_sale=store, product__in=qs).values_list("product_id", "quantity")
        )
        results = []
        for p in qs:
            promo = p.active_promotion(store)
            price = promo.discounted_price(p.price) if promo else p.price
            results.append(
                {
                    "id": p.id,
                    "sku": p.sku,
                    "name": p.name,
                    "category": p.category.name if p.category else None,
                    "unit": p.unit,
                    "price": str(p.price),
                    "effective_price": str(price),
                    "promotion": promo.name if promo else None,
                    "stock": stock_by_product.get(p.id, 0),
                    "image": request.build_absolute_uri(p.image.url) if p.image else None,
                }
            )
        categories = [
            {"name": l.category.name, "order": l.order}
            for l in StoreCategory.objects.filter(point_of_sale=store).select_related("category")
        ]
        return Response(
            {"point_of_sale": store.name, "results": results, "categories": categories, "settings": pos_settings(store)}
        )


METHOD_LABELS = {
    "cash": "Especes",
    "card": "Carte bancaire",
    "wave": "Wave",
    "orange_money": "Orange Money",
}


def receipt_payload(order, profile, received=None):
    """Donnees du ticket de caisse (vente et reimpression depuis l'historique)."""
    total = order.total_amount
    return {
        "reference": order.reference,
        "receipt_number": order.reference[:8].upper(),
        "created_at": order.created_at,
        "point_of_sale": profile.point_of_sale.name,
        "cashier": profile.user.username,
        "customer_name": order.customer_name,
        "table_label": order.table_label,
        "payment_method": order.payment_method,
        "payment_method_label": METHOD_LABELS.get(order.payment_method, order.payment_method),
        "items": [
            {
                "name": i.product_name,
                "quantity": i.quantity,
                "unit_price": str(i.unit_price),
                "subtotal": str(i.subtotal),
            }
            for i in order.items.all()
        ],
        "receipt_slogan": pos_settings(profile.point_of_sale)["receipt_slogan"],
        "receipt_footer": pos_settings(profile.point_of_sale)["receipt_footer"],
        "total": str(total),
        "amount_received": str(received) if received is not None else None,
        "change": str(received - total) if received is not None and received >= total else None,
    }


class POSSaleView(APIView):
    """
    POST /api/pos/sales/
    body: {items: [{product, quantity}], payment_method, customer_name?, amount_received?}
    GET  /api/pos/sales/ -> historique des ventes du jour de ce caissier (pour reimprimer un ticket)
    """

    permission_classes = [IsCashier]

    def get(self, request):
        profile = request.user.cashier_profile
        orders = (
            Order.objects.filter(
                channel=Order.Channel.POS,
                cashier=request.user,
                status=Order.Status.PAID,
                created_at__date=timezone.localdate(),
            )
            .prefetch_related("items")
            .order_by("-created_at")
        )
        return Response([receipt_payload(o, profile) for o in orders])

    def post(self, request):
        profile = request.user.cashier_profile
        order, received = create_pos_sale(
            profile,
            request.data.get("items", []),
            request.data.get("payment_method"),
            request.data.get("customer_name", ""),
            request.data.get("amount_received"),
            str(request.data.get("table_label") or "").strip(),
        )
        return Response(receipt_payload(order, profile, received), status=201)


class POSClosingView(APIView):
    """
    Fermeture de caisse du caissier connecte, pour aujourd'hui.

    GET  /api/pos/closing/ -> etat du jour. Le comptage se fait "a l'aveugle" : tant que la caisse n'est
                              pas fermee, les montants attendus ne sont PAS communiques au caissier.
                              Une fois fermee, le caissier voit son ecart et peut corriger son comptage
                              (POST a nouveau) ; l'ecart initial et le nombre de corrections sont conserves.
    POST /api/pos/closing/ -> body {declared_cash, declared_wave, declared_orange_money, declared_card, notes}
    """

    permission_classes = [IsCashier]

    def _closing_today(self, profile):
        return DailyClosing.objects.filter(
            date=timezone.localdate(), point_of_sale=profile.point_of_sale, cashier=profile.user
        ).first()

    def get(self, request):
        profile = request.user.cashier_profile
        closing = self._closing_today(profile)
        _, sales_count = cashier_sales_totals(profile, timezone.localdate())
        return Response(
            {
                "date": timezone.localdate(),
                "point_of_sale": profile.point_of_sale.name,
                "closed": closing is not None,
                "sales_count": sales_count,
                "closing": DailyClosingSerializer(closing).data if closing else None,
            }
        )

    def post(self, request):
        profile = request.user.cashier_profile
        data = request.data
        closing, created = close_cashier_day(
            profile,
            {
                "cash": data.get("declared_cash"),
                "wave": data.get("declared_wave"),
                "orange_money": data.get("declared_orange_money"),
                "card": data.get("declared_card"),
            },
            data.get("notes", ""),
        )
        return Response(DailyClosingSerializer(closing).data, status=201 if created else 200)


class POSCustomerOrdersView(APIView):
    """GET /api/pos/customer-orders/ : commandes des clients (site web) rattachees a ce point de vente, 7 derniers jours."""

    permission_classes = [IsCashier]

    def get(self, request):
        store = request.user.cashier_profile.point_of_sale
        since = timezone.now() - timezone.timedelta(days=7)
        orders = (
            Order.objects.filter(channel=Order.Channel.ONLINE, point_of_sale=store, created_at__gte=since)
            .prefetch_related("items")
            .order_by("-created_at")
        )
        return Response(
            [
                {
                    "reference": o.reference[:8].upper(),
                    "created_at": o.created_at,
                    "status": o.status,
                    "status_label": o.get_status_display(),
                    "customer_name": o.customer_name,
                    "customer_phone": o.customer_phone,
                    "delivery_address": o.delivery_address,
                    "maps_url": o.location_maps_url,
                    "payment_method_label": METHOD_LABELS.get(o.payment_method, o.payment_method),
                    "total": str(o.total_amount),
                    "items": [{"name": i.product_name, "quantity": i.quantity} for i in o.items.all()],
                }
                for o in orders
            ]
        )


class POSDrawerView(APIView):
    """
    POST /api/pos/drawer/ {reason} : enregistre une ouverture du tiroir hors vente (controle).
    GET : ouvertures du jour. L'ouverture physique necessite un tiroir branche a l'imprimante de tickets.
    """

    permission_classes = [IsCashier]

    def get(self, request):
        store = request.user.cashier_profile.point_of_sale
        rows = DrawerOpening.objects.filter(point_of_sale=store, created_at__date=timezone.localdate())
        return Response(
            [{"id": r.id, "reason": r.reason, "cashier": r.cashier.username if r.cashier else None, "created_at": r.created_at} for r in rows]
        )

    def post(self, request):
        reason = str(request.data.get("reason") or "").strip()
        if not reason:
            from rest_framework.exceptions import ValidationError

            raise ValidationError({"reason": "Indiquez le motif de l'ouverture."})
        row = DrawerOpening.objects.create(
            point_of_sale=request.user.cashier_profile.point_of_sale, cashier=request.user, reason=reason[:200]
        )
        return Response({"id": row.id, "reason": row.reason, "created_at": row.created_at}, status=201)
