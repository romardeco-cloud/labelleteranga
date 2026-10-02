import time

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from apps.catalog.models import Product
from apps.orders.models import Order, OrderItem
from apps.stores.models import PointOfSale, Stock


class BulkDeleteProductsTests(TestCase):
    """Bouton "Supprimer tous les produits affiches" (admin > Produits) : action groupee bulk-update / delete."""

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(User.objects.create_user("admin-test", is_staff=True))
        self.store = PointOfSale.objects.create(name="Supermarche Test")
        self.other = PointOfSale.objects.create(name="Depot Test")

    def _product(self, n, *stores):
        p = Product.objects.create(sku=f"SKU-{n}", name=f"Produit {n}", price=1000)
        for s in stores:
            Stock.objects.create(product=p, point_of_sale=s)
        return p

    def _delete(self, ids, **extra):
        return self.client.post(
            "/api/catalog/products/bulk-update/",
            {"ids": ids, "point_of_sale": self.store.pk, "action": "delete", **extra},
            format="json",
        )

    def test_delete_all_keeps_shared_products_and_past_sales(self):
        own = [self._product(i, self.store) for i in range(3)]
        shared = self._product("partage", self.store, self.other)
        elsewhere = self._product("ailleurs", self.other)
        order = Order.objects.create(channel=Order.Channel.POS, status=Order.Status.PAID, customer_name="Client", total_amount=1000, point_of_sale=self.store)
        item = OrderItem.objects.create(order=order, product=own[0], product_name="Produit 0", unit_price=1000, quantity=1)

        res = self._delete([p.pk for p in own] + [shared.pk], confirm=True)

        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["updated"], 4)
        self.assertFalse(Product.objects.filter(pk__in=[p.pk for p in own]).exists())
        # le produit partage reste vendu par l'autre point de vente, seulement retire de celui-ci
        self.assertEqual(list(Stock.objects.filter(product=shared).values_list("point_of_sale_id", flat=True)), [self.other.pk])
        self.assertTrue(Product.objects.filter(pk=elsewhere.pk).exists())
        # la vente passee reste dans les rapports
        item.refresh_from_db()
        self.assertIsNone(item.product_id)
        self.assertEqual(item.product_name, "Produit 0")

    def test_delete_requires_confirmation(self):
        p = self._product(1, self.store)
        self.assertEqual(self._delete([p.pk]).status_code, 400)
        self.assertTrue(Product.objects.filter(pk=p.pk).exists())

    def test_delete_hundreds_at_once_is_fast(self):
        ids = [self._product(i, self.store).pk for i in range(600)]
        start = time.monotonic()
        res = self._delete(ids, confirm=True)
        self.assertEqual(res.data["updated"], 600)
        self.assertLess(time.monotonic() - start, 10)
