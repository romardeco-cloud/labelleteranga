from rest_framework import serializers

from apps.catalog.models import Product

from .models import InventoryCount, InventoryCountLine, PointOfSale, Stock, StockMovement


class PointOfSaleSerializer(serializers.ModelSerializer):
    class Meta:
        model = PointOfSale
        fields = ["id", "name", "address", "phone", "is_active", "created_at"]


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
