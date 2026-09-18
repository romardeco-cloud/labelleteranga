from rest_framework.routers import DefaultRouter

from .views import CategoryViewSet, ProductViewSet, PromotionViewSet

router = DefaultRouter()
router.register("categories", CategoryViewSet, basename="category")
router.register("products", ProductViewSet, basename="product")
router.register("promotions", PromotionViewSet, basename="promotion")

urlpatterns = router.urls
