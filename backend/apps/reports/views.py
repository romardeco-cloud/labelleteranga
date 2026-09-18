from datetime import date as date_cls
from datetime import timedelta

from django.db.models import Count, F, Sum
from django.db.models.functions import TruncDate, TruncMonth, TruncYear
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.orders.models import Order, OrderItem

from .models import DailyClosing
from .serializers import DailyClosingSerializer


def _paid_orders_qs(start=None, end=None, point_of_sale=None):
    qs = Order.objects.filter(status=Order.Status.PAID)
    if start:
        qs = qs.filter(paid_at__gte=start)
    if end:
        qs = qs.filter(paid_at__lt=end)
    if point_of_sale is not None:
        qs = qs.filter(point_of_sale_id=point_of_sale)
    return qs


def _compute_expected_totals(for_date, point_of_sale=None):
    """Totaux payes ce jour-la, par moyen de paiement (utilise pour la cloture)."""
    totals = {key: 0 for key, _ in Order.PaymentMethod.choices}
    qs = Order.objects.filter(status=Order.Status.PAID, paid_at__date=for_date, point_of_sale_id=point_of_sale)
    qs = qs.values("payment_method").annotate(total=Sum("total_amount"))
    for row in qs:
        totals[row["payment_method"]] = row["total"] or 0
    return totals


class DailySalesView(APIView):
    """GET /api/reports/daily/?days=30 - ventes des N derniers jours."""

    permission_classes = [IsAdminUser]

    def get(self, request):
        days = int(request.query_params.get("days", 30))
        start = timezone.now() - timedelta(days=days)
        qs = (
            _paid_orders_qs(start=start)
            .annotate(day=TruncDate("paid_at"))
            .values("day")
            .annotate(revenue=Sum("total_amount"), orders_count=Count("id"))
            .order_by("day")
        )
        return Response(list(qs))


class MonthlySalesView(APIView):
    """GET /api/reports/monthly/?year=2026 - ventes mensuelles pour une annee (annee courante par defaut)."""

    permission_classes = [IsAdminUser]

    def get(self, request):
        year = int(request.query_params.get("year", timezone.now().year))
        qs = (
            _paid_orders_qs(start=f"{year}-01-01", end=f"{year + 1}-01-01")
            .annotate(month=TruncMonth("paid_at"))
            .values("month")
            .annotate(revenue=Sum("total_amount"), orders_count=Count("id"))
            .order_by("month")
        )
        return Response(list(qs))


class YearlySalesView(APIView):
    """GET /api/reports/yearly/ - ventes annuelles, toutes annees confondues."""

    permission_classes = [IsAdminUser]

    def get(self, request):
        qs = (
            _paid_orders_qs()
            .annotate(year=TruncYear("paid_at"))
            .values("year")
            .annotate(revenue=Sum("total_amount"), orders_count=Count("id"))
            .order_by("year")
        )
        return Response(list(qs))


class SummaryView(APIView):
    """
    GET /api/reports/summary/
    Chiffres cles: aujourd'hui, ce mois-ci, mois precedent, cette annee.
    """

    permission_classes = [IsAdminUser]

    def get(self, request):
        now = timezone.now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        if month_start.month == 1:
            prev_month_start = month_start.replace(year=month_start.year - 1, month=12)
        else:
            prev_month_start = month_start.replace(month=month_start.month - 1)

        year_start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)

        def totals(qs):
            agg = qs.aggregate(revenue=Sum("total_amount"), orders_count=Count("id"))
            return {"revenue": agg["revenue"] or 0, "orders_count": agg["orders_count"] or 0}

        return Response(
            {
                "today": totals(_paid_orders_qs(start=today_start)),
                "this_month": totals(_paid_orders_qs(start=month_start)),
                "previous_month": totals(_paid_orders_qs(start=prev_month_start, end=month_start)),
                "this_year": totals(_paid_orders_qs(start=year_start)),
            }
        )


class PreviousMonthsView(APIView):
    """GET /api/reports/previous-months/?count=6 - ventes des N derniers mois (glissant)."""

    permission_classes = [IsAdminUser]

    def get(self, request):
        count = int(request.query_params.get("count", 6))
        now = timezone.now()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        # premier jour du mois, count mois en arriere
        year = month_start.year
        month = month_start.month - count
        while month <= 0:
            month += 12
            year -= 1
        start = month_start.replace(year=year, month=month)

        qs = (
            _paid_orders_qs(start=start)
            .annotate(month=TruncMonth("paid_at"))
            .values("month")
            .annotate(revenue=Sum("total_amount"), orders_count=Count("id"))
            .order_by("month")
        )
        return Response(list(qs))


class PaymentMethodBreakdownView(APIView):
    """
    GET /api/reports/by-payment-method/?period=today|month|year
    Repartition du chiffre d'affaires par moyen de paiement sur la periode.
    """

    permission_classes = [IsAdminUser]

    def get(self, request):
        period = request.query_params.get("period", "month")
        pos_param = request.query_params.get("point_of_sale")
        now = timezone.now()
        if period == "today":
            start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        elif period == "year":
            start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        else:
            start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        qs = _paid_orders_qs(start=start)
        if pos_param:
            qs = qs.filter(point_of_sale_id=pos_param)

        qs = qs.values("payment_method").annotate(revenue=Sum("total_amount"), orders_count=Count("id")).order_by(
            "payment_method"
        )
        return Response(list(qs))


class ProductSalesView(APIView):
    """
    GET /api/reports/by-product/?start=2026-09-01&end=2026-09-30&point_of_sale=1
    Ventes par produit sur une periode (par defaut : le mois en cours).
    Trie par chiffre d'affaires decroissant.
    """

    permission_classes = [IsAdminUser]

    def get(self, request):
        start_str = request.query_params.get("start")
        end_str = request.query_params.get("end")
        pos_param = request.query_params.get("point_of_sale")

        now = timezone.now()
        if start_str:
            start = date_cls.fromisoformat(start_str)
        else:
            start = now.replace(day=1).date()
        if end_str:
            end = date_cls.fromisoformat(end_str) + timedelta(days=1)
        else:
            end = (now + timedelta(days=1)).date()

        qs = OrderItem.objects.filter(
            order__status=Order.Status.PAID,
            order__paid_at__date__gte=start,
            order__paid_at__date__lt=end,
        )
        if pos_param:
            qs = qs.filter(order__point_of_sale_id=pos_param)

        qs = (
            qs.values("product_id", "product_name")
            .annotate(
                quantity_sold=Sum("quantity"),
                revenue=Sum(F("unit_price") * F("quantity")),
                orders_count=Count("order_id", distinct=True),
            )
            .order_by("-revenue")
        )
        return Response(list(qs))


class DailyClosingViewSet(viewsets.ModelViewSet):
    """
    Cloture de caisse journaliere, par point de vente (point_of_sale=null
    correspond aux commandes en ligne non affectees a un magasin).

    GET  /api/reports/closings/                                  -> historique des clotures
    GET  /api/reports/closings/preview/?date=...&point_of_sale=... -> montants attendus, sans sauvegarder
    POST /api/reports/closings/                                   -> cloture une journee (body: date, point_of_sale, declared_*, notes)
    PATCH /api/reports/closings/<id>/                              -> corrige une cloture existante
    """

    queryset = DailyClosing.objects.select_related("point_of_sale", "closed_by").all()
    serializer_class = DailyClosingSerializer
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        qs = super().get_queryset()
        pos_param = self.request.query_params.get("point_of_sale")
        if pos_param:
            qs = qs.filter(point_of_sale_id=pos_param)
        return qs

    def _apply_expected_totals(self, serializer, for_date, point_of_sale):
        totals = _compute_expected_totals(for_date, point_of_sale=point_of_sale)
        serializer.save(
            expected_card=totals.get(Order.PaymentMethod.CARD, 0),
            expected_wave=totals.get(Order.PaymentMethod.WAVE, 0),
            expected_orange_money=totals.get(Order.PaymentMethod.ORANGE_MONEY, 0),
            expected_cash=totals.get(Order.PaymentMethod.CASH, 0),
        )

    def perform_create(self, serializer):
        for_date = serializer.validated_data["date"]
        point_of_sale = serializer.validated_data.get("point_of_sale")
        if DailyClosing.objects.filter(
            date=for_date, point_of_sale=point_of_sale, cashier__isnull=True
        ).exists():
            raise ValidationError({"date": "Une cloture existe deja pour ce jour et ce point de vente."})
        serializer.save(closed_by=self.request.user)
        self._apply_expected_totals(serializer, for_date, point_of_sale.id if point_of_sale else None)

    def perform_update(self, serializer):
        for_date = serializer.instance.date
        point_of_sale = serializer.instance.point_of_sale_id
        self._apply_expected_totals(serializer, for_date, point_of_sale)

    @action(detail=False, methods=["get"])
    def preview(self, request):
        date_str = request.query_params.get("date")
        pos_param = request.query_params.get("point_of_sale") or None
        if not date_str:
            return Response({"detail": "Parametre date requis (YYYY-MM-DD)."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            for_date = date_cls.fromisoformat(date_str)
        except ValueError:
            return Response({"detail": "Date invalide."}, status=status.HTTP_400_BAD_REQUEST)

        totals = _compute_expected_totals(for_date, point_of_sale=pos_param)
        existing = DailyClosing.objects.filter(date=for_date, point_of_sale_id=pos_param, cashier__isnull=True).first()
        return Response(
            {
                "date": date_str,
                "point_of_sale": pos_param,
                "expected": {
                    "card": totals.get(Order.PaymentMethod.CARD, 0),
                    "wave": totals.get(Order.PaymentMethod.WAVE, 0),
                    "orange_money": totals.get(Order.PaymentMethod.ORANGE_MONEY, 0),
                    "cash": totals.get(Order.PaymentMethod.CASH, 0),
                },
                "already_closed": existing is not None,
                "closing": DailyClosingSerializer(existing).data if existing else None,
            }
        )
