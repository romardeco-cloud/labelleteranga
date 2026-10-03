from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog.models import Product
from apps.stores.models import PointOfSale, Stock, tracks_stock

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
    """POST /api/cart/<session_key>/add/  body: {product_id, quantity, variant?, weight_kg?}
    variant : format choisi (obligatoire si le produit a des formats) ; weight_kg : poids voulu (produit vendu au poids)."""

    def post(self, request, session_key):
        from apps.catalog.lignes import resoudre_ligne, stock_format

        cart = _get_cart(session_key, request.data.get("store"))
        product = get_object_or_404(Product.objects.prefetch_related("variants"), pk=request.data.get("product_id"), is_active=True)
        quantity = max(1, int(request.data.get("quantity", 1)))
        try:
            ligne = resoudre_ligne(product, cart.point_of_sale, request.data.get("variant") or None, request.data.get("weight_kg"))
        except ValidationError as exc:
            return Response({"detail": " ".join(str(m) for v in exc.detail.values() for m in (v if isinstance(v, list) else [v]))}, status=status.HTTP_400_BAD_REQUEST)

        # une ligne au poids reste toujours separee ; sinon on cumule avec la meme ligne (meme format)
        existing = None
        if ligne.weight_kg is None:
            existing = CartItem.objects.filter(cart=cart, product=product, variant=ligne.variant, weight_kg__isnull=True).first()

        if cart.point_of_sale_id:  # panier d'un site : produit du meme point de vente, dans la limite du stock
            stock = Stock.objects.filter(product=product, point_of_sale_id=cart.point_of_sale_id).first()
            if not stock:
                return Response({"detail": "Ce produit n'est pas vendu sur ce site."}, status=status.HTTP_400_BAD_REQUEST)
            wanted = quantity + (existing.quantity if existing else 0)
            if tracks_stock(cart.point_of_sale) and stock.track_stock and ligne.weight_kg is None:
                dispo = stock_format(ligne.variant, cart.point_of_sale) if ligne.variant else stock.quantity
                if wanted > dispo:
                    return Response({"detail": f"Stock insuffisant pour {ligne.nom} (disponible : {dispo})."}, status=status.HTTP_400_BAD_REQUEST)

        if existing:
            existing.quantity += quantity
            existing.save(update_fields=["quantity"])
        else:
            CartItem.objects.create(cart=cart, product=product, quantity=quantity, variant=ligne.variant, weight_kg=ligne.weight_kg)

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
