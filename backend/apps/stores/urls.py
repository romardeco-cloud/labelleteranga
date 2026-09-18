from rest_framework.routers import DefaultRouter

from .views import (
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

urlpatterns = router.urls
