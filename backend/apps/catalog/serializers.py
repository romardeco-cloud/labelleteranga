from rest_framework import serializers

from apps.stores.serializers import StockSerializer

from .models import Category, Product, Promotion


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug"]


class ProductSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)
    category_id = serializers.PrimaryKeyRelatedField(
        source="category", queryset=Category.objects.all(), write_only=True, required=False, allow_null=True
    )
    total_stock = serializers.IntegerField(read_only=True)
    stocks = StockSerializer(many=True, read_only=True)
    effective_price = serializers.SerializerMethodField()
    active_promotion_name = serializers.SerializerMethodField()
    in_stock = serializers.SerializerMethodField()
    store_stock = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id",
            "sku",
            "name",
            "slug",
            "description",
            "category",
            "category_id",
            "price",
            "compare_at_price",
            "effective_price",
            "active_promotion_name",
            "total_stock",
            "stocks",
            "unit",
            "image",
            "is_active",
            "in_stock",
            "store_stock",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "slug", "created_at", "updated_at"]

    def _store_quantity(self, product):
        store = self.context.get("store")
        if not store:
            return None
        from apps.stores.models import UNLIMITED_STOCK, tracks_stock

        if not tracks_stock(store):
            return UNLIMITED_STOCK  # pas de suivi de stock : toujours disponible
        return next((s.quantity for s in product.stocks.all() if s.point_of_sale_id == store.id), 0)

    def get_store_stock(self, product):
        return self._store_quantity(product)

    def get_in_stock(self, product):
        q = self._store_quantity(product)
        return product.in_stock if q is None else q > 0

    def _price_label(self, product):
        from apps.stores.services import price_for, special_prices_map

        store = self.context.get("store")
        cache = self.context.setdefault("_specials", {})
        key = store.id if store else 0
        if key not in cache:
            cache[key] = special_prices_map(store)
        return price_for(product, store, cache[key])

    def get_effective_price(self, product):
        return self._price_label(product)[0]

    def get_active_promotion_name(self, product):
        return self._price_label(product)[1]


class PromotionSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True, default=None)
    point_of_sale_name = serializers.CharField(source="point_of_sale.name", read_only=True, default=None)
    product_names = serializers.SerializerMethodField()
    is_current = serializers.SerializerMethodField()

    class Meta:
        model = Promotion
        fields = [
            "id",
            "name",
            "discount_type",
            "value",
            "category",
            "category_name",
            "products",
            "product_names",
            "point_of_sale",
            "point_of_sale_name",
            "start_date",
            "end_date",
            "is_active",
            "is_current",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def get_product_names(self, promo):
        return [p.name for p in promo.products.all()]

    def get_is_current(self, promo):
        return promo.is_current()
