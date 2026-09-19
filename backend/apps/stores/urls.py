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
from .views_engagement import (
    ComboAdminViewSet,
    ComboRequestAdminViewSet,
    CompanySealView,
    LoyaltyAdminView,
    ReviewAdminViewSet,
    SiteComboRequestView,
    SiteCombosView,
    SiteLoyaltyView,
    SiteReviewsView,
)

router = DefaultRouter()
router.register("reviews", ReviewAdminViewSet, basename="review-admin")
router.register("combos", ComboAdminViewSet, basename="combo-admin")
router.register("combo-requests", ComboRequestAdminViewSet, basename="combo-request-admin")
router.register("points-of-sale", PointOfSaleViewSet, basename="point-of-sale")
router.register("stock", StockViewSet, basename="stock")
router.register("categories", StoreCategoryViewSet, basename="store-category")
router.register("movements", StockMovementViewSet, basename="stock-movement")
router.register("inventories", InventoryCountViewSet, basename="inventory")

urlpatterns = [
    path("sites/", SiteListView.as_view()),
    path("sites/<slug:slug>/menu/", SiteDailyMenuView.as_view()),
    path("sites/<slug:slug>/reviews/", SiteReviewsView.as_view()),
    path("sites/<slug:slug>/loyalty/", SiteLoyaltyView.as_view()),
    path("sites/<slug:slug>/combos/", SiteCombosView.as_view()),
    path("sites/<slug:slug>/combo-requests/", SiteComboRequestView.as_view()),
    path("loyalty/", LoyaltyAdminView.as_view()),
    path("company-seal/", CompanySealView.as_view()),
    path("sites/<slug:slug>/", SiteDetailView.as_view()),
    path("daily-menus/", DailyMenuAdminView.as_view()),
] + router.urls
