from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.models import Product
from apps.stores.models import PointOfSale, Stock

from .models import Cart, CartItem
from .serializers import CartSerializer


def _get_cart(session_key, store_slug=None):
    """Panier de la session ; le premier appel depuis un site le rattache a ce point de vente."""
    cart, _ = Cart.objects.get_or_create(session_key=session_key)
    if store_slug and cart.point_of_sale_id is None:
        store = PointOfSale.objects.filter(slug=store_slug, online_enabled=True, is_active=True).first()
        if store:
            cart.point_of_sale = store
            cart.save(update_fields=["point_of_sale"])
    return cart


class CartDetailView(APIView):
    """GET /api/cart/<session_key>/"""

    def get(self, request, session_key):
        cart = _get_cart(session_key, request.query_params.get("store"))
        return Response(CartSerializer(cart).data)


class CartAddItemView(APIView):
    """POST /api/cart/<session_key>/add/  body: {product_id, quantity}"""

    def post(self, request, session_key):
        cart = _get_cart(session_key, request.data.get("store"))
        product = get_object_or_404(Product, pk=request.data.get("product_id"), is_active=True)
        quantity = max(1, int(request.data.get("quantity", 1)))

        if cart.point_of_sale_id:  # panier d'un site : produit du meme point de vente, dans la limite du stock
            stock = Stock.objects.filter(product=product, point_of_sale_id=cart.point_of_sale_id).first()
            existing = CartItem.objects.filter(cart=cart, product=product).first()
            wanted = quantity + (existing.quantity if existing else 0)
            if not stock:
                return Response({"detail": "Ce produit n'est pas vendu sur ce site."}, status=status.HTTP_400_BAD_REQUEST)
            if wanted > stock.quantity:
                return Response(
                    {"detail": f"Stock insuffisant pour {product.name} (disponible : {stock.quantity})."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        item, created = CartItem.objects.get_or_create(cart=cart, product=product, defaults={"quantity": quantity})
        if not created:
            item.quantity += quantity
            item.save()

        return Response(CartSerializer(cart).data, status=status.HTTP_201_CREATED)


class CartUpdateItemView(APIView):
    """PATCH /api/cart/<session_key>/items/<item_id>/  body: {quantity}"""

    def patch(self, request, session_key, item_id):
        cart = _get_cart(session_key)
        item = get_object_or_404(CartItem, pk=item_id, cart=cart)
        quantity = int(request.data.get("quantity", item.quantity))
        if quantity <= 0:
            item.delete()
        else:
            item.quantity = quantity
            item.save()
        return Response(CartSerializer(cart).data)

    def delete(self, request, session_key, item_id):
        cart = _get_cart(session_key)
        get_object_or_404(CartItem, pk=item_id, cart=cart).delete()
        return Response(CartSerializer(cart).data)


class CartClearView(APIView):
    def post(self, request, session_key):
        cart = _get_cart(session_key)
        cart.items.all().delete()
        return Response(CartSerializer(cart).data)
