from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.models import Product

from .models import Cart, CartItem
from .serializers import CartSerializer


def _get_cart(session_key):
    cart, _ = Cart.objects.get_or_create(session_key=session_key)
    return cart


class CartDetailView(APIView):
    """GET /api/cart/<session_key>/"""

    def get(self, request, session_key):
        cart = _get_cart(session_key)
        return Response(CartSerializer(cart).data)


class CartAddItemView(APIView):
    """POST /api/cart/<session_key>/add/  body: {product_id, quantity}"""

    def post(self, request, session_key):
        cart = _get_cart(session_key)
        product = get_object_or_404(Product, pk=request.data.get("product_id"))
        quantity = int(request.data.get("quantity", 1))

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
