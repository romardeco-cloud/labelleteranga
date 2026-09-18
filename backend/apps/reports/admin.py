from django.contrib import admin

from .models import DailyClosing


@admin.register(DailyClosing)
class DailyClosingAdmin(admin.ModelAdmin):
    list_display = ["date", "expected_total", "declared_total", "discrepancy_total", "closed_by", "closed_at"]
    list_filter = ["date"]
    readonly_fields = [
        "expected_card",
        "expected_wave",
        "expected_orange_money",
        "expected_cash",
        "closed_by",
        "closed_at",
        "updated_at",
    ]
