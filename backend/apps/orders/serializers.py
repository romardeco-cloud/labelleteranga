from rest_framework import serializers

from .models import Order, OrderItem


class OrderItemSerializer(serializers.ModelSerializer):
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = OrderItem
        fields = ["id", "product", "product_name", "unit_price", "quantity", "subtotal"]


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = [
            "id",
            "reference",
            "customer_name",
            "customer_email",
            "customer_phone",
            "delivery_address",
            "status",
            "total_amount",
            "items",
            "created_at",
            "paid_at",
        ]
        read_only_fields = ["reference", "status", "total_amount", "created_at", "paid_at"]
