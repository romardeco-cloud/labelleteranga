from rest_framework.routers import DefaultRouter

from .views import InventoryCountViewSet, PointOfSaleViewSet, StockMovementViewSet, StockViewSet

router = DefaultRouter()
router.register("points-of-sale", PointOfSaleViewSet, basename="point-of-sale")
router.register("stock", StockViewSet, basename="stock")
router.register("movements", StockMovementViewSet, basename="stock-movement")
router.register("inventories", InventoryCountViewSet, basename="inventory")

urlpatterns = router.urls
