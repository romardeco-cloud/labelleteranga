from django.contrib import admin

from .models import PointOfSale, Stock


@admin.register(PointOfSale)
class PointOfSaleAdmin(admin.ModelAdmin):
    list_display = ["name", "address", "phone", "is_active"]
    list_filter = ["is_active"]
    search_fields = ["name", "address"]


@admin.register(Stock)
class StockAdmin(admin.ModelAdmin):
    list_display = ["product", "point_of_sale", "quantity", "updated_at"]
    list_filter = ["point_of_sale"]
    search_fields = ["product__name", "product__sku"]
