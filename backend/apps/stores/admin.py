from django.contrib import admin

from .models import InventoryCount, InventoryCountLine, PointOfSale, Stock, StockMovement


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


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = ["created_at", "product", "point_of_sale", "delta", "quantity_after", "reason", "reference", "user"]
    list_filter = ["reason", "point_of_sale"]
    search_fields = ["product__name", "product__sku", "reference"]


class InventoryCountLineInline(admin.TabularInline):
    model = InventoryCountLine
    extra = 0


@admin.register(InventoryCount)
class InventoryCountAdmin(admin.ModelAdmin):
    list_display = ["number", "point_of_sale", "date", "status"]
    list_filter = ["status", "point_of_sale"]
    inlines = [InventoryCountLineInline]


from .models import DrawerOpening, StoreCategory, StoreSettings  # noqa: E402


@admin.register(StoreCategory)
class StoreCategoryAdmin(admin.ModelAdmin):
    list_display = ["point_of_sale", "category", "order"]
    list_filter = ["point_of_sale"]


@admin.register(StoreSettings)
class StoreSettingsAdmin(admin.ModelAdmin):
    list_display = ["point_of_sale", "legal_form", "vat_rate"]


@admin.register(DrawerOpening)
class DrawerOpeningAdmin(admin.ModelAdmin):
    list_display = ["created_at", "point_of_sale", "cashier", "reason"]
    list_filter = ["point_of_sale"]
