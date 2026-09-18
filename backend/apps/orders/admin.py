from django.contrib import admin

from .models import Order, OrderItem
from .services import mark_order_paid


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ["product", "product_name", "unit_price", "quantity"]


@admin.action(description="Marquer comme payee (declenche la confirmation WhatsApp)")
def mark_as_paid(modeladmin, request, queryset):
    for order in queryset.exclude(status=Order.Status.PAID):
        mark_order_paid(order)


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ["reference", "customer_name", "payment_method", "status", "total_amount", "created_at", "paid_at"]
    list_filter = ["status", "payment_method", "created_at"]
    search_fields = ["reference", "customer_name", "customer_email"]
    inlines = [OrderItemInline]
    actions = [mark_as_paid]
    readonly_fields = [
        "reference",
        "stripe_checkout_session_id",
        "stripe_payment_intent_id",
        "wave_checkout_id",
        "orange_money_order_id",
        "whatsapp_confirmation_sent_at",
        "created_at",
        "paid_at",
    ]
