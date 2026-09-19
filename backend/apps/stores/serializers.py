from rest_framework import serializers

from apps.catalog.models import Product

from .models import (
    InventoryCount,
    InventoryCountLine,
    PointOfSale,
    Stock,
    StockMovement,
    StoreCategory,
    StoreSettings,
    get_settings,
)


class PointOfSaleSerializer(serializers.ModelSerializer):
    track_stock = serializers.SerializerMethodField()

    class Meta:
        model = PointOfSale
        fields = ["id", "name", "slug", "online_enabled", "description", "address", "phone", "is_active", "created_at", "track_stock"]

    def get_track_stock(self, store):
        return get_settings(store).track_stock

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Le nom est obligatoire.")
        return value


class StockSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    point_of_sale_name = serializers.CharField(source="point_of_sale.name", read_only=True)

    class Meta:
        model = Stock
        fields = [
            "id",
            "product",
            "product_name",
            "product_sku",
            "point_of_sale",
            "point_of_sale_name",
            "quantity",
            "track_stock",
            "updated_at",
        ]


class SetStockSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    point_of_sale = serializers.PrimaryKeyRelatedField(queryset=PointOfSale.objects.all())
    quantity = serializers.IntegerField(min_value=0)


class StockMovementSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    point_of_sale_name = serializers.CharField(source="point_of_sale.name", read_only=True)
    reason_label = serializers.CharField(source="get_reason_display", read_only=True)
    user_username = serializers.CharField(source="user.username", read_only=True, default=None)

    class Meta:
        model = StockMovement
        fields = [
            "id", "product", "product_name", "product_sku", "point_of_sale", "point_of_sale_name",
            "delta", "quantity_after", "reason", "reason_label", "reference", "user_username", "created_at",
        ]


class InventoryLineSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    category = serializers.CharField(source="product.category.name", read_only=True, default=None)
    unit_price = serializers.DecimalField(source="product.price", max_digits=12, decimal_places=2, read_only=True)
    variance = serializers.IntegerField(read_only=True)

    class Meta:
        model = InventoryCountLine
        fields = [
            "id", "product", "product_name", "product_sku", "category", "unit_price",
            "theoretical_quantity", "counted_quantity", "variance",
        ]


class InventoryCountSerializer(serializers.ModelSerializer):
    point_of_sale_name = serializers.CharField(source="point_of_sale.name", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True, default=None)
    lines_count = serializers.SerializerMethodField()
    counted_count = serializers.SerializerMethodField()
    variance_units = serializers.SerializerMethodField()
    variance_value = serializers.SerializerMethodField()

    class Meta:
        model = InventoryCount
        fields = [
            "id", "number", "point_of_sale", "point_of_sale_name", "date", "status", "status_label", "notes",
            "created_by_username", "validated_at", "created_at",
            "lines_count", "counted_count", "variance_units", "variance_value",
        ]
        read_only_fields = ["number", "status", "validated_at", "created_at"]

    def _counted(self, obj):
        return [l for l in obj.lines.all() if l.counted_quantity is not None]

    def get_lines_count(self, obj):
        return len(obj.lines.all())

    def get_counted_count(self, obj):
        return len(self._counted(obj))

    def get_variance_units(self, obj):
        return sum(l.variance for l in self._counted(obj))

    def get_variance_value(self, obj):
        return float(sum(l.variance * l.product.price for l in self._counted(obj)))


class InventoryCountDetailSerializer(InventoryCountSerializer):
    lines = InventoryLineSerializer(many=True, read_only=True)

    class Meta(InventoryCountSerializer.Meta):
        fields = InventoryCountSerializer.Meta.fields + ["lines"]


SETTINGS_FIELDS = [
    "timezone", "email", "legal_form", "share_capital", "ninea", "rccm", "vat_rate", "prices_include_vat",
    "payment_methods", "wave_pay_url", "orange_pay_url", "wave_number", "orange_number", "track_stock", "receipt_slogan", "receipt_footer", "module_hold", "module_history", "module_qr",
    "module_dine_in", "module_customer_orders", "module_drawer", "module_xreport",
    "social_links", "loyalty_enabled", "loyalty_mode", "loyalty_threshold", "loyalty_min_order", "loyalty_reward_type",
    "loyalty_reward_value", "loyalty_reward_label", "loyalty_valid_days",
]

SOCIAL_KEYS = ["whatsapp", "phone", "facebook", "instagram", "tiktok", "x", "youtube", "telegram", "website"]


class StoreSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = StoreSettings
        fields = SETTINGS_FIELDS

    @staticmethod
    def _https_only(value):
        if value and not value.lower().startswith("https://"):
            raise serializers.ValidationError("Le lien doit commencer par https://")
        return value

    def validate_wave_pay_url(self, value):
        return self._https_only(value)

    def validate_orange_pay_url(self, value):
        return self._https_only(value)

    def validate_social_links(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Objet attendu.")
        clean = {}
        for key, val in value.items():
            if key not in SOCIAL_KEYS:
                raise serializers.ValidationError(f"Reseau inconnu : {key}")
            val = str(val or "").strip()
            if val:
                clean[key] = val[:200]
        return clean

    def validate_loyalty_threshold(self, value):
        if value < 1:
            raise serializers.ValidationError("Le seuil doit etre au moins 1.")
        return value

    def validate(self, attrs):
        if attrs.get("loyalty_enabled") and attrs.get("loyalty_reward_type") == "gift" and not attrs.get("loyalty_reward_label"):
            raise serializers.ValidationError({"loyalty_reward_label": "Decrivez le cadeau offert."})
        return attrs

    def validate_payment_methods(self, value):
        allowed = {"cash", "wave", "orange_money", "card"}
        if not isinstance(value, list) or not value or any(v not in allowed for v in value):
            raise serializers.ValidationError("Choisissez au moins un moyen de paiement valide.")
        return value


def store_config(store):
    """Point de vente + parametres, a plat (page Administration > Parametres)."""
    return {
        "id": store.id,
        "name": store.name,
        "address": store.address,
        "phone": store.phone,
        "is_active": store.is_active,
        "slug": store.slug,
        "online_enabled": store.online_enabled,
        "description": store.description,
        **StoreSettingsSerializer(get_settings(store)).data,
    }


def pos_settings(store):
    """Sous-ensemble utile a la caisse."""
    st = get_settings(store)
    return {
        "payment_methods": st.payment_methods,
        "modules": {
            "hold": st.module_hold,
            "history": st.module_history,
            "qr": st.module_qr,
            "dine_in": st.module_dine_in,
            "customer_orders": st.module_customer_orders,
            "drawer": st.module_drawer,
            "xreport": st.module_xreport,
        },
        "receipt_slogan": st.receipt_slogan,
        "receipt_footer": st.receipt_footer,
        "loyalty": st.loyalty_enabled,
    }


class StoreCategorySerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="category.name", read_only=True)
    products_count = serializers.IntegerField(read_only=True, default=0)  # produits actifs (visibles en caisse)
    hidden_count = serializers.IntegerField(read_only=True, default=0)  # produits masques (non actifs)
    stock_total = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = StoreCategory
        fields = ["id", "point_of_sale", "category", "name", "order", "products_count", "hidden_count", "stock_total"]
        read_only_fields = ["category"]
