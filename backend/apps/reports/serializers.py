from rest_framework import serializers

from .models import DailyClosing


class DailyClosingSerializer(serializers.ModelSerializer):
    closed_by_username = serializers.CharField(source="closed_by.username", read_only=True, default=None)
    point_of_sale_name = serializers.CharField(source="point_of_sale.name", read_only=True, default=None)
    cashier_username = serializers.CharField(source="cashier.username", read_only=True, default=None)
    expected_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    declared_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    discrepancy_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    discrepancy_card = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    discrepancy_wave = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    discrepancy_orange_money = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    discrepancy_cash = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = DailyClosing
        fields = [
            "id",
            "date",
            "point_of_sale",
            "point_of_sale_name",
            "cashier_username",
            "closed_by_username",
            "closed_at",
            "updated_at",
            "expected_card",
            "expected_wave",
            "expected_orange_money",
            "expected_cash",
            "expected_total",
            "declared_card",
            "declared_wave",
            "declared_orange_money",
            "declared_cash",
            "declared_total",
            "discrepancy_card",
            "discrepancy_wave",
            "discrepancy_orange_money",
            "discrepancy_cash",
            "discrepancy_total",
            "notes",
            "initial_discrepancy_total",
            "revision_count",
        ]
        read_only_fields = [
            "id",
            "closed_by_username",
            "closed_at",
            "updated_at",
            "expected_card",
            "expected_wave",
            "expected_orange_money",
            "expected_cash",
            "initial_discrepancy_total",
            "revision_count",
        ]
