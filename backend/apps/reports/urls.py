from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    DailyClosingViewSet,
    DailySalesView,
    MonthlySalesView,
    PaymentMethodBreakdownView,
    PreviousMonthsView,
    ProductSalesView,
    SummaryView,
    YearlySalesView,
)

router = DefaultRouter()
router.register("closings", DailyClosingViewSet, basename="daily-closing")

urlpatterns = [
    path("daily/", DailySalesView.as_view()),
    path("monthly/", MonthlySalesView.as_view()),
    path("yearly/", YearlySalesView.as_view()),
    path("previous-months/", PreviousMonthsView.as_view()),
    path("summary/", SummaryView.as_view()),
    path("by-payment-method/", PaymentMethodBreakdownView.as_view()),
    path("by-product/", ProductSalesView.as_view()),
    path("", include(router.urls)),
]
