from rest_framework.routers import DefaultRouter

from .views import PointOfSaleViewSet, StockViewSet

router = DefaultRouter()
router.register("points-of-sale", PointOfSaleViewSet, basename="point-of-sale")
router.register("stock", StockViewSet, basename="stock")

urlpatterns = router.urls
