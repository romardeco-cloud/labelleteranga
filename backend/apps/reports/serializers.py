from rest_framework import serializers

from .models import CashierOpening, DailyClosing


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
    opening_cash = serializers.SerializerMethodField()
    sales_total = serializers.SerializerMethodField()

    def get_opening_cash(self, obj):
        """
        Fond de caisse du premier jour couvert : purement informatif, affiche a cote de la fermeture pour que
        le caissier puisse le recompter separement, mais jamais ajoute a expected_cash/expected_total (voir
        apps.pos.services._sales_totals_range) ni a aucun montant de la fermeture.
        """
        if obj.opening_cash is not None:
            return obj.opening_cash
        opening = CashierOpening.objects.filter(date=obj.date, point_of_sale=obj.point_of_sale, cashier=obj.cashier).first()
        return opening.opening_cash if opening else 0

    def get_sales_total(self, obj):
        """Ventes de la fermeture (identique a expected_total, qui ne contient deja que des ventes)."""
        return obj.expected_total

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
            "opening_cash",
            "sales_total",
            "declared_card",
            "declared_wave",
            "declared_orange_money",
            "declared_cash",
            "declared_total",
            "tips_total",
            "discrepancy_card",
            "discrepancy_wave",
            "discrepancy_orange_money",
            "discrepancy_cash",
            "discrepancy_total",
            "notes",
            "initial_discrepancy_total",
            "revision_count",
            "auto_closed",
            "covers_from",
            "covers_through",
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
            "tips_total",
            "initial_discrepancy_total",
            "revision_count",
        ]


class CashierOpeningSerializer(serializers.ModelSerializer):
    point_of_sale_name = serializers.CharField(source="point_of_sale.name", read_only=True, default=None)
    cashier_username = serializers.CharField(source="cashier.username", read_only=True, default=None)
    opened_by_username = serializers.CharField(source="opened_by.username", read_only=True, default=None)

    class Meta:
        model = CashierOpening
        fields = ["id", "date", "point_of_sale", "point_of_sale_name", "cashier_username", "opening_cash", "opened_by_username", "notes", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]
