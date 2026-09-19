from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

def health(_request):
    """Etat du serveur et version deployee (aide au diagnostic des mises en ligne)."""
    import os

    from django.http import JsonResponse

    return JsonResponse({"status": "ok", "commit": os.environ.get("RENDER_GIT_COMMIT", "")[:7]})


urlpatterns = [
    path("api/health/", health),
    path("admin/", admin.site.urls),
    path("api/catalog/", include("apps.catalog.urls")),
    path("api/cart/", include("apps.cart.urls")),
    path("api/orders/", include("apps.orders.urls")),
    path("api/payments/", include("apps.payments.urls")),
    path("api/reports/", include("apps.reports.urls")),
    path("api/accounts/", include("apps.accounts.urls")),
    path("api/stores/", include("apps.stores.urls")),
    path("api/pos/", include("apps.pos.urls")),
    path("api/documents/", include("apps.documents.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
