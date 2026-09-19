from rest_framework.routers import DefaultRouter

from django.urls import path

from .views import (
    DailyMenuAdminView,
    SiteDailyMenuView,
    SiteDetailView,
    SiteListView,
    InventoryCountViewSet,
    PointOfSaleViewSet,
    StockMovementViewSet,
    StockViewSet,
    StoreCategoryViewSet,
)

router = DefaultRouter()
router.register("points-of-sale", PointOfSaleViewSet, basename="point-of-sale")
router.register("stock", StockViewSet, basename="stock")
router.register("categories", StoreCategoryViewSet, basename="store-category")
router.register("movements", StockMovementViewSet, basename="stock-movement")
router.register("inventories", InventoryCountViewSet, basename="inventory")

urlpatterns = [
    path("sites/", SiteListView.as_view()),
    path("sites/<slug:slug>/menu/", SiteDailyMenuView.as_view()),
    path("sites/<slug:slug>/", SiteDetailView.as_view()),
    path("daily-menus/", DailyMenuAdminView.as_view()),
] + router.urls
