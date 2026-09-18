from django.db.models import Q
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsCashier
from apps.catalog.models import Product
from apps.stores.models import Stock

from .services import create_pos_sale


class POSProductListView(APIView):
    """GET /api/pos/products/?search=... - produits vendables avec le stock du magasin du caissier."""

    permission_classes = [IsCashier]

    def get(self, request):
        store = request.user.cashier_profile.point_of_sale
        qs = Product.objects.filter(is_active=True).select_related("category")
        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(sku__icontains=search))
        qs = qs.order_by("name")[:80]

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
        return Response({"point_of_sale": store.name, "results": results})


class POSSaleView(APIView):
    """
    POST /api/pos/sales/
    body: {items: [{product, quantity}], payment_method, customer_name?, amount_received?}
    """

    permission_classes = [IsCashier]

    def post(self, request):
        profile = request.user.cashier_profile
        order, received = create_pos_sale(
            profile,
            request.data.get("items", []),
            request.data.get("payment_method"),
            request.data.get("customer_name", ""),
            request.data.get("amount_received"),
        )
        total = order.total_amount
        return Response(
            {
                "reference": order.reference,
                "receipt_number": order.reference[:8].upper(),
                "created_at": order.created_at,
                "point_of_sale": profile.point_of_sale.name,
                "cashier": request.user.username,
                "customer_name": order.customer_name,
                "payment_method": order.payment_method,
                "payment_method_label": {
                    "cash": "Especes",
                    "card": "Carte bancaire",
                    "wave": "Wave",
                    "orange_money": "Orange Money",
                }.get(order.payment_method, order.payment_method),
                "items": [
                    {
                        "name": i.product_name,
                        "quantity": i.quantity,
                        "unit_price": str(i.unit_price),
                        "subtotal": str(i.subtotal),
                    }
                    for i in order.items.all()
                ],
                "total": str(total),
                "amount_received": str(received) if received is not None else None,
                "change": str(received - total) if received is not None and received >= total else None,
            },
            status=201,
        )
