from django.contrib import admin

from .models import Order, OrderItem


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ["product", "product_name", "unit_price", "quantity"]


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ["reference", "customer_name", "status", "total_amount", "created_at", "paid_at"]
    list_filter = ["status", "created_at"]
    search_fields = ["reference", "customer_name", "customer_email"]
    inlines = [OrderItemInline]
    readonly_fields = ["reference", "stripe_checkout_session_id", "stripe_payment_intent_id", "created_at", "paid_at"]
