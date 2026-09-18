from django.contrib import admin

from .models import CashierProfile


@admin.register(CashierProfile)
class CashierProfileAdmin(admin.ModelAdmin):
    list_display = ["user", "point_of_sale", "is_active", "created_at"]
    list_filter = ["point_of_sale", "is_active"]
