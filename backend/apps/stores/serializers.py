from rest_framework import serializers

from apps.catalog.models import Product

from .models import PointOfSale, Stock


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
