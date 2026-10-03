from rest_framework import serializers

from apps.catalog.serializers import ProductSerializer

from .models import Cart, CartItem


class CartItemSerializer(serializers.ModelSerializer):
    product = ProductSerializer(read_only=True)
    subtotal = serializers.SerializerMethodField()
    unit_price = serializers.SerializerMethodField()
    label = serializers.SerializerMethodField()

    class Meta:
        model = CartItem
        fields = ["id", "product", "quantity", "variant", "weight_kg", "label", "unit_price", "subtotal"]

    def _ligne(self, item):
        cache = self.context.setdefault("_lignes", {})
        if item.pk not in cache:
            try:
                cache[item.pk] = item.ligne()
            except Exception:  # noqa: BLE001 - format retire depuis l'ajout au panier : ligne a revoir par le client
                cache[item.pk] = None
        return cache[item.pk]

    def get_label(self, item):
        ligne = self._ligne(item)
        return ligne.label if ligne else "Format indisponible : retirez cet article"

    def get_unit_price(self, item):
        ligne = self._ligne(item)
        return str(ligne.unit_price) if ligne else "0"

    def get_subtotal(self, item):
        ligne = self._ligne(item)
        return str(ligne.unit_price * item.quantity) if ligne else "0"


class CartSerializer(serializers.ModelSerializer):
    items = CartItemSerializer(many=True, read_only=True)
    total = serializers.SerializerMethodField()

    def get_total(self, cart):
        total = 0
        for item in cart.items.select_related("product", "variant").all():
            try:
                total += item.subtotal
            except Exception:  # noqa: BLE001 - format retire : la ligne compte pour 0
                pass
        return str(total)

    class Meta:
        model = Cart
        fields = ["id", "session_key", "point_of_sale", "items", "total"]
