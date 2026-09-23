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
    total_stock = serializers.SerializerMethodField()
    stocks = StockSerializer(many=True, read_only=True)
    effective_price = serializers.SerializerMethodField()
    active_promotion_name = serializers.SerializerMethodField()
    in_stock = serializers.SerializerMethodField()
    store_stock = serializers.SerializerMethodField()
    combo_items = serializers.SerializerMethodField()

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
            "combo_items",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "slug", "created_at", "updated_at"]

    def _total_stock(self, product):
        # somme en memoire sur les stocks deja precharges (prefetch_related) : evite une requete SQL par produit
        return sum(s.quantity for s in product.stocks.all())

    def get_total_stock(self, product):
        return self._total_stock(product)

    def get_combo_items(self, product):
        """Elements du combo du meme nom (site web d'un point de vente) ; liste vide pour un produit ordinaire."""
        store = self.context.get("store")
        if not store or "combo" not in product.name.lower():
            return []
        from apps.stores.combo_items import combo_items_map, norm_name

        cache = self.context.setdefault("_combo_items", {})
        if store.pk not in cache:
            cache[store.pk] = combo_items_map(store)
        return cache[store.pk].get(norm_name(product.name), [])

    def _store_quantity(self, product):
        store = self.context.get("store")
        if not store:
            return None
        from apps.stores.models import UNLIMITED_STOCK, tracks_stock

        if not tracks_stock(store):
            return UNLIMITED_STOCK  # pas de suivi de stock : toujours disponible
        row = next((s for s in product.stocks.all() if s.point_of_sale_id == store.id), None)
        if row is not None and not row.track_stock:
            return UNLIMITED_STOCK  # suivi desactive pour ce produit : toujours disponible
        return row.quantity if row else 0

    def get_store_stock(self, product):
        return self._store_quantity(product)

    def get_in_stock(self, product):
        q = self._store_quantity(product)
        return self._total_stock(product) > 0 if q is None else q > 0

    def _price_label(self, product):
        from apps.stores.services import load_promotions, price_for, special_prices_map

        store = self.context.get("store")
        cache = self.context.setdefault("_specials", {})
        key = store.id if store else 0
        if key not in cache:
            cache[key] = special_prices_map(store)
        if "_promos" not in self.context:
            self.context["_promos"] = load_promotions()
        return price_for(product, store, cache[key], self.context["_promos"])

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
