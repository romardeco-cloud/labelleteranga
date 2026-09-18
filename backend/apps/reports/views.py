from datetime import timedelta

from django.db.models import Count, Sum
from django.db.models.functions import TruncDate, TruncMonth, TruncYear
from django.utils import timezone
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.orders.models import Order


def _paid_orders_qs(start=None, end=None):
    qs = Order.objects.filter(status=Order.Status.PAID)
    if start:
        qs = qs.filter(paid_at__gte=start)
    if end:
        qs = qs.filter(paid_at__lt=end)
    return qs


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
