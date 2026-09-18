from django.http import HttpResponse
from django.urls import path
from django.contrib import admin, messages
from django.shortcuts import redirect, render

from .excel import export_products_to_excel, import_products_from_excel
from .models import Category, Product


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "slug"]
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ["name", "sku", "category", "price", "stock_quantity", "is_active"]
    list_filter = ["category", "is_active"]
    search_fields = ["name", "sku"]
    change_list_template = "catalog/product_changelist.html"

    def get_urls(self):
        urls = super().get_urls()
        custom = [
            path("export-excel/", self.admin_site.admin_view(self.export_excel), name="catalog_product_export"),
            path("import-excel/", self.admin_site.admin_view(self.import_excel), name="catalog_product_import"),
        ]
        return custom + urls

    def export_excel(self, request):
        buffer = export_products_to_excel()
        response = HttpResponse(
            buffer.read(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        response["Content-Disposition"] = 'attachment; filename="produits_labelleteranga.xlsx"'
        return response

    def import_excel(self, request):
        if request.method == "POST" and request.FILES.get("file"):
            summary = import_products_from_excel(request.FILES["file"])
            messages.success(
                request,
                f"Import termine: {summary['created']} crees, {summary['updated']} mis a jour, "
                f"{len(summary['errors'])} erreurs.",
            )
            for err in summary["errors"][:10]:
                messages.warning(request, err)
            return redirect("..")
        return render(request, "catalog/import_excel.html")
