from rest_framework import serializers

from .models import Category, Product


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug"]


class ProductSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)
    category_id = serializers.PrimaryKeyRelatedField(
        source="category", queryset=Category.objects.all(), write_only=True, required=False, allow_null=True
    )

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
            "stock_quantity",
            "unit",
            "image",
            "is_active",
            "in_stock",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "slug", "created_at", "updated_at"]
