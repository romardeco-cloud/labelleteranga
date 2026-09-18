from django.urls import path

from .views import (
    DailySalesView,
    MonthlySalesView,
    PreviousMonthsView,
    SummaryView,
    YearlySalesView,
)

urlpatterns = [
    path("daily/", DailySalesView.as_view()),
    path("monthly/", MonthlySalesView.as_view()),
    path("yearly/", YearlySalesView.as_view()),
    path("previous-months/", PreviousMonthsView.as_view()),
    path("summary/", SummaryView.as_view()),
]
