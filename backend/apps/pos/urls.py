from django.urls import path

from .views import POSClosingView, POSCustomerOrdersView, POSDrawerView, POSLoyaltyView, POSProductListView, POSSaleView

urlpatterns = [
    path("products/", POSProductListView.as_view()),
    path("sales/", POSSaleView.as_view()),
    path("closing/", POSClosingView.as_view()),
    path("customer-orders/", POSCustomerOrdersView.as_view()),
    path("drawer/", POSDrawerView.as_view()),
    path("loyalty/", POSLoyaltyView.as_view()),
]
