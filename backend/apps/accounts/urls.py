from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from .views import AdminLoginView, CashierLoginView, CashierViewSet, SecurityCodeView, StaffListView

router = DefaultRouter()
router.register("cashiers", CashierViewSet, basename="cashier")

urlpatterns = [
    path("login/", AdminLoginView.as_view()),
    path("cashier-login/", CashierLoginView.as_view()),
    path("staff/", StaffListView.as_view()),
    path("security-code/", SecurityCodeView.as_view()),
    path("token/refresh/", TokenRefreshView.as_view()),
    path("", include(router.urls)),
]
