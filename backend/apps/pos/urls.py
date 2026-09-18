from django.urls import path

from .views import POSProductListView, POSSaleView

urlpatterns = [
    path("products/", POSProductListView.as_view()),
    path("sales/", POSSaleView.as_view()),
]
