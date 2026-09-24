import calendar
from collections import defaultdict
from datetime import date as date_cls
from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, DecimalField, ExpressionWrapper, F, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.documents.models import Invoice, InvoicePayment, PaymentMethod, PurchaseOrderPayment
from apps.orders.models import Order, OrderItem
from apps.stores.models import PointOfSale, Stock

METHOD_LABELS = dict(PaymentMethod.choices)
ONLINE_LABEL = "En ligne (non affecte)"
LOW_STOCK_THRESHOLD = 5


def _f(value):
    return float(value or 0)


def _range(period, day):
    """Retourne (start, end, precedent_start, precedent_end) pour un jour, un mois ou une annee."""
    if period == "year":
        start, end = day.replace(month=1, day=1), day.replace(month=12, day=31)
        return start, end, start.replace(year=start.year - 1), end.replace(year=end.year - 1)
    if period == "month":
        start = day.replace(day=1)
        end = day.replace(day=calendar.monthrange(day.year, day.month)[1])
        pend = start - timedelta(days=1)
        return start, end, pend.replace(day=1), pend
    prev = day - timedelta(days=1)
    return day, day, prev, prev


class Totals:
    """Chiffres d'une periode : ventes (caisse + en ligne) + encaissements de factures, moins achats payes."""

    def __init__(self, start, end, store):
        orders = Order.objects.filter(status=Order.Status.PAID, paid_at__date__gte=start, paid_at__date__lte=end)
        inv_pay = InvoicePayment.objects.filter(
            date__gte=start, date__lte=end, invoice__status=Invoice.Status.ISSUED
        )
        po_pay = PurchaseOrderPayment.objects.filter(date__gte=start, date__lte=end)
        if store:
            orders = orders.filter(point_of_sale_id=store)
            inv_pay = inv_pay.filter(invoice__point_of_sale_id=store)
            po_pay = po_pay.filter(purchase_order__point_of_sale_id=store)
        self.orders, self.inv_pay, self.po_pay = orders, inv_pay, po_pay

        agg = orders.aggregate(total=Sum("total_amount"), n=Count("id"), tips=Sum("tip_amount"))
        self.sales = _f(agg["total"])
        self.orders_count = agg["n"] or 0
        # deja compris dans self.sales (Order.total_amount inclut le pourboire) : purement informatif, jamais retire.
        self.tips = _f(agg["tips"])
        self.invoices = _f(inv_pay.aggregate(t=Sum("amount"))["t"])
        self.revenue = self.sales + self.invoices
        self.expenses = _f(po_pay.aggregate(t=Sum("amount"))["t"])
        self.net = self.revenue - self.expenses
        self.average_ticket = self.sales / self.orders_count if self.orders_count else 0


def _trend(current, previous):
    """Variation en % par rapport a la periode precedente (None si pas de base de comparaison)."""
    if not previous:
        return None
    return round((current - previous) / abs(previous) * 100, 1)


def _kpi(key, label, current, previous, kind="money", hint=""):
    return {"key": key, "label": label, "value": current, "trend": _trend(current, previous), "kind": kind, "hint": hint}


def _series(period, day, start, end, store):
    """Serie du graphique : 7 derniers jours (jour), jours du mois (mois) ou mois de l'annee (annee)."""
    if period == "day":
        s = day - timedelta(days=6)
        keys = [s + timedelta(days=i) for i in range(7)]
        s, e = keys[0], keys[-1]
    elif period == "month":
        s, e = start, end
        keys = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    else:
        s, e = start, end
        keys = [date_cls(start.year, m, 1) for m in range(1, 13)]

    t = Totals(s, e, store)
    by_day = defaultdict(float)
    for r in t.orders.annotate(d=TruncDate("paid_at")).values("d").annotate(v=Sum("total_amount")):
        by_day[r["d"]] += _f(r["v"])
    for r in t.inv_pay.values("date").annotate(v=Sum("amount")):
        by_day[r["date"]] += _f(r["v"])

    points = []
    for k in keys:
        if period == "year":
            value = sum(v for d, v in by_day.items() if d.year == k.year and d.month == k.month)
            label = k.strftime("%m")
        else:
            value = by_day.get(k, 0.0)
            label = k.strftime("%d/%m")
        points.append({"key": k.isoformat(), "label": label, "revenue": value})
    return points


class DashboardView(APIView):
    """
    GET /api/reports/dashboard/?period=day|month|year&date=YYYY-MM-DD&point_of_sale=<id>
    Tableau de bord : indicateurs vs periode precedente, comparaison des sites, evolution,
    repartition par categorie et par mode de paiement, meilleurs produits, alertes.
    """

    permission_classes = [IsAdminUser]

    def get(self, request):
        p = request.query_params
        period = p.get("period") if p.get("period") in ("day", "month", "year") else "day"
        try:
            day = date_cls.fromisoformat(p["date"]) if p.get("date") else timezone.localdate()
        except ValueError:
            day = timezone.localdate()
        store = p.get("point_of_sale") or None

        start, end, pstart, pend = _range(period, day)
        cur, prev = Totals(start, end, store), Totals(pstart, pend, store)

        kpis = [
            _kpi("revenue", "Chiffre d'affaires", cur.revenue, prev.revenue,
                 hint=f"Ventes {cur.sales:,.0f} + factures encaissees {cur.invoices:,.0f}".replace(",", " ")),
            _kpi("orders", "Ventes", cur.orders_count, prev.orders_count, kind="count"),
            _kpi("expenses", "Depenses (achats payes)", cur.expenses, prev.expenses),
            _kpi("net", "Solde net", cur.net, prev.net),
            _kpi("ticket", "Panier moyen", cur.average_ticket, prev.average_ticket),
            _kpi("tips", "Pourboires", cur.tips, prev.tips, hint="Deja compris dans les ventes, sans effet sur l'ecart de caisse."),
        ]

        # --- sites
        sites = []
        if not store:
            stores = list(PointOfSale.objects.filter(is_active=True).order_by("name"))
            sales_by = {r["point_of_sale"]: r for r in cur.orders.values("point_of_sale").annotate(v=Sum("total_amount"), n=Count("id"))}
            inv_by = defaultdict(float)
            for r in cur.inv_pay.values("invoice__point_of_sale").annotate(v=Sum("amount")):
                inv_by[r["invoice__point_of_sale"]] += _f(r["v"])
            for s in stores:
                row = sales_by.get(s.id)
                sites.append(
                    {
                        "id": s.id,
                        "label": s.name,
                        "revenue": _f(row["v"] if row else 0) + inv_by.get(s.id, 0.0),
                        "orders_count": row["n"] if row else 0,
                    }
                )
            unassigned = sales_by.get(None)
            if unassigned or inv_by.get(None):
                sites.append(
                    {
                        "id": None,
                        "label": ONLINE_LABEL,
                        "revenue": _f(unassigned["v"] if unassigned else 0) + inv_by.get(None, 0.0),
                        "orders_count": unassigned["n"] if unassigned else 0,
                    }
                )
            sites.sort(key=lambda r: -r["revenue"])

        # --- categories (ventes caisse + en ligne)
        line_total = ExpressionWrapper(F("unit_price") * F("quantity"), output_field=DecimalField(max_digits=14, decimal_places=2))
        items = OrderItem.objects.filter(order__in=cur.orders)
        cat_rows = items.values("product__category__name").annotate(v=Sum(line_total)).order_by("-v")
        categories = [{"label": r["product__category__name"] or "Sans categorie", "revenue": _f(r["v"])} for r in cat_rows]
        cat_total = sum(c["revenue"] for c in categories) or 1
        for c in categories:
            c["share"] = round(100 * c["revenue"] / cat_total, 1)

        # --- modes de paiement (ventes + factures)
        methods = defaultdict(float)
        for r in cur.orders.values("payment_method").annotate(v=Sum("total_amount")):
            methods[r["payment_method"]] += _f(r["v"])
        for r in cur.inv_pay.values("method").annotate(v=Sum("amount")):
            methods[r["method"]] += _f(r["v"])
        pay_total = sum(methods.values()) or 1
        payment_methods = [
            {"key": k, "label": METHOD_LABELS.get(k, k or "Non precise"), "amount": v, "share": round(100 * v / pay_total, 1)}
            for k, v in sorted(methods.items(), key=lambda kv: -kv[1])
        ]

        # --- meilleurs produits
        top = (
            items.values("product_name")
            .annotate(qty=Sum("quantity"), v=Sum(line_total))
            .order_by("-v")[:6]
        )
        top_products = [{"name": r["product_name"], "quantity": r["qty"], "revenue": _f(r["v"])} for r in top]

        # --- alertes
        stock_qs = Stock.objects.filter(
            product__is_active=True, point_of_sale__is_active=True, quantity__lte=LOW_STOCK_THRESHOLD
        )
        if store:
            stock_qs = stock_qs.filter(point_of_sale_id=store)
        overdue = [
            i
            for i in Invoice.objects.filter(status=Invoice.Status.ISSUED, due_date__lt=timezone.localdate())
            .prefetch_related("items", "payments")
            if i.is_overdue and (not store or str(i.point_of_sale_id) == str(store))
        ]

        return Response(
            {
                "period": period,
                "date": day,
                "range": {"start": start, "end": end, "previous_start": pstart, "previous_end": pend},
                "point_of_sale": store,
                "kpis": kpis,
                "sites": sites,
                "series": _series(period, day, start, end, store),
                "categories": categories,
                "payment_methods": payment_methods,
                "top_products": top_products,
                "alerts": {
                    "low_stock": stock_qs.count(),
                    "low_stock_threshold": LOW_STOCK_THRESHOLD,
                    "overdue_invoices": len(overdue),
                    "overdue_amount": _f(sum((i.balance for i in overdue), Decimal("0"))),
                },
            }
        )
