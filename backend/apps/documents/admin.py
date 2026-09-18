from django.contrib import admin

from .models import Customer, Invoice, PurchaseOrder, Quote, Supplier

for model in (Customer, Supplier, Quote, Invoice, PurchaseOrder):
    admin.site.register(model)
