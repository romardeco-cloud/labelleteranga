from rest_framework import serializers

from .models import Order, OrderItem


class OrderItemSerializer(serializers.ModelSerializer):
    subtotal = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = OrderItem
        fields = ["id", "product", "product_name", "unit_price", "quantity", "subtotal"]


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    customer_whatsapp_link = serializers.SerializerMethodField()
    shop_whatsapp_link = serializers.SerializerMethodField()
    point_of_sale_name = serializers.CharField(source="point_of_sale.name", read_only=True, default=None)
    voided_by_username = serializers.CharField(source="voided_by.username", read_only=True, default=None)
    order_number = serializers.CharField(read_only=True)

    class Meta:
        model = Order
        fields = [
            "id",
            "reference",
            "channel",
            "fulfillment",
            "table_label",
            "service_mode",
            "point_of_sale",
            "point_of_sale_name",
            "customer_name",
            "customer_email",
            "customer_phone",
            "delivery_address",
            "delivery_latitude",
            "delivery_longitude",
            "location_maps_url",
            "status",
            "payment_method",
            "total_amount",
            "items",
            "created_at",
            "paid_at",
            "voided_at",
            "voided_by_username",
            "void_reason",
            "order_number",
            "payment_reference",
            "payment_declared_at",
            "whatsapp_confirmation_sent_at",
            "whatsapp_status",
            "whatsapp_error",
            "customer_whatsapp_link",
            "shop_whatsapp_link",
        ]
        read_only_fields = ["reference", "channel", "status", "total_amount", "created_at", "paid_at", "voided_at", "void_reason", "payment_reference", "payment_declared_at"]

    def _whatsapp_message(self, order):
        from apps.notifications.whatsapp import build_confirmation_message

        return build_confirmation_message(order)

    def get_customer_whatsapp_link(self, order):
        if order.status != Order.Status.PAID:
            return None
        from apps.notifications.whatsapp import whatsapp_deep_link

        return whatsapp_deep_link(order.customer_phone, self._whatsapp_message(order))

    def get_shop_whatsapp_link(self, order):
        if order.status != Order.Status.PAID:
            return None
        from django.conf import settings

        from apps.notifications.whatsapp import whatsapp_deep_link

        return whatsapp_deep_link(settings.WHATSAPP_SHOP_NUMBER, self._whatsapp_message(order))
