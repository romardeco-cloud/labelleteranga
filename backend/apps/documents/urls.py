from rest_framework.routers import DefaultRouter

from .views import CustomerViewSet, InvoiceViewSet, PurchaseOrderViewSet, QuoteViewSet, SupplierViewSet

router = DefaultRouter()
router.register("customers", CustomerViewSet, basename="customer")
router.register("suppliers", SupplierViewSet, basename="supplier")
router.register("quotes", QuoteViewSet, basename="quote")
router.register("invoices", InvoiceViewSet, basename="invoice")
router.register("purchase-orders", PurchaseOrderViewSet, basename="purchase-order")

urlpatterns = router.urls
