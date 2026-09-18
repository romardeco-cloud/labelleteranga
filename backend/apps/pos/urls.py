from django.urls import path

from .views import POSClosingView, POSProductListView, POSSaleView

urlpatterns = [
    path("products/", POSProductListView.as_view()),
    path("sales/", POSSaleView.as_view()),
    path("closing/", POSClosingView.as_view()),
]
