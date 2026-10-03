"""Formats (taille, grandeur, poids conditionne) avec leur prix et leur stock, et vente au poids : panier, commande, caisse."""
from decimal import Decimal

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.catalog.models import Product, ProductVariant
from apps.orders.models import Order
from apps.stores.models import PointOfSale, Stock, VariantStock


class FormatsTests(TestCase):
    def setUp(self):
        self.store = PointOfSale.objects.create(name="Supermarche Test", slug="sm-test", online_enabled=True, is_active=True)
        self.riz = Product.objects.create(sku="RIZ", name="Riz brise", price=700)
        Stock.objects.create(product=self.riz, point_of_sale=self.store, quantity=0)
        self.kg1 = ProductVariant.objects.create(product=self.riz, label="1 kg", price=700, order=0)
        self.sac = ProductVariant.objects.create(product=self.riz, label="Sac 25 kg", price=15000, order=1)
        VariantStock.objects.create(variant=self.kg1, point_of_sale=self.store, quantity=10)
        VariantStock.objects.create(variant=self.sac, point_of_sale=self.store, quantity=2)
        self.tomate = Product.objects.create(sku="TOM", name="Tomates", price=800, sold_by_weight=True)
        Stock.objects.create(product=self.tomate, point_of_sale=self.store, quantity=0)
        self.simple = Product.objects.create(sku="SUC", name="Sucre 1kg", price=700)
        Stock.objects.create(product=self.simple, point_of_sale=self.store, quantity=5)
        self.client = APIClient()

    def _add(self, session, **data):
        return self.client.post(f"/api/cart/{session}/add/", {"store": "sm-test", **data}, format="json")

    def test_panier_et_commande_avec_formats_et_poids(self):
        from apps.orders.services import create_order_from_cart, mark_order_paid

        s = "sess-formats"
        self.assertEqual(self._add(s, product_id=self.riz.pk).status_code, 400)  # format obligatoire
        self.assertEqual(self._add(s, product_id=self.riz.pk, variant=self.sac.pk, quantity=3).status_code, 400)  # 2 sacs en stock
        res = self._add(s, product_id=self.riz.pk, variant=self.sac.pk, quantity=2)
        self.assertEqual(res.status_code, 201, res.data)
        self._add(s, product_id=self.riz.pk, variant=self.kg1.pk)
        self.assertEqual(self._add(s, product_id=self.tomate.pk).status_code, 400)  # poids obligatoire
        res = self._add(s, product_id=self.tomate.pk, weight_kg="1,35")
        self.assertEqual(res.status_code, 201, res.data)
        self._add(s, product_id=self.simple.pk, quantity=2)
        lignes = {i["label"]: i for i in res.data["items"]}
        self.assertEqual(lignes["1,35 kg"]["subtotal"], "1080")  # 800 F/kg x 1,35 kg
        self.assertEqual(Decimal(res.data["total"]), 2 * 15000 + 700 + 1080)

        order = create_order_from_cart(s, {"customer_name": "Awa", "customer_phone": "770000000"}, "cash")
        items = {i.product_name: i for i in order.items.all()}
        self.assertEqual(items["Riz brise - Sac 25 kg"].unit_price, 15000)
        self.assertEqual(items["Riz brise - Sac 25 kg"].quantity, 2)
        self.assertEqual(items["Tomates - 1,35 kg"].weight_kg, Decimal("1.350"))
        self.assertEqual(items["Sucre 1kg"].unit_price, 700)
        self.assertEqual(order.total_amount, 2 * 15000 + 700 + 1080 + 1400)

        mark_order_paid(order)
        self.assertEqual(VariantStock.objects.get(variant=self.sac).quantity, 0)
        self.assertEqual(VariantStock.objects.get(variant=self.kg1).quantity, 9)
        self.assertEqual(Stock.objects.get(product=self.simple).quantity, 3)

    def test_caisse_formats_poids_et_annulation(self):
        from apps.accounts.models import CashierProfile
        from apps.orders.services import void_order
        from apps.pos.services import create_pos_sale
        from apps.reports.models import CashierOpening

        user = User.objects.create_user("caisse-formats")
        profile = CashierProfile.objects.create(user=user, point_of_sale=self.store)
        CashierOpening.objects.create(date=timezone.localdate(), point_of_sale=self.store, cashier=user, opening_cash=0)
        order, _ = create_pos_sale(
            profile,
            [
                {"product": self.riz.pk, "quantity": 1, "variant": self.sac.pk},
                {"product": self.riz.pk, "quantity": 3, "variant": self.kg1.pk},
                {"product": self.tomate.pk, "quantity": 1, "weight_kg": "0.5"},
            ],
            "cash",
        )
        self.assertEqual(order.total_amount, 15000 + 3 * 700 + 400)
        self.assertEqual(VariantStock.objects.get(variant=self.sac).quantity, 1)
        self.assertEqual(VariantStock.objects.get(variant=self.kg1).quantity, 7)
        void_order(order, user, "test")
        self.assertEqual(VariantStock.objects.get(variant=self.sac).quantity, 2)
        self.assertEqual(VariantStock.objects.get(variant=self.kg1).quantity, 10)

    def test_admin_formats_et_stock(self):
        admin = APIClient()
        admin.force_authenticate(User.objects.create_user("admin-formats", is_staff=True))
        url = f"/api/catalog/products/{self.riz.pk}/"
        res = admin.patch(url, {"variants": [{"id": self.kg1.pk, "label": "1 kg", "price": 750}, {"label": "5 kg", "price": "3 300"}]}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual([(v["label"], v["price"]) for v in res.data["variants"]], [("1 kg", "750.00"), ("5 kg", "3300.00")])
        self.assertFalse(ProductVariant.objects.filter(pk=self.sac.pk).exists())  # retire de la liste : supprime
        cinq = ProductVariant.objects.get(product=self.riz, label="5 kg")
        res = admin.post(f"{url}variant-stock/", {"variant": cinq.pk, "point_of_sale": self.store.pk, "quantity": 12}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(VariantStock.objects.get(variant=cinq, point_of_sale=self.store).quantity, 12)
        # un produit sans formats ne change pas
        res = admin.patch(f"/api/catalog/products/{self.simple.pk}/", {"price": 800}, format="json")
        self.assertEqual(res.data["variants"], [])

    def test_boutique_disponibilite(self):
        res = self.client.get(f"/api/catalog/products/{self.riz.pk}/", {"store": "sm-test"})
        self.assertTrue(res.data["in_stock"])
        self.assertEqual({v["label"]: v["stock"] for v in res.data["variants"]}, {"1 kg": 10, "Sac 25 kg": 2})
        res = self.client.get(f"/api/catalog/products/{self.tomate.pk}/", {"store": "sm-test"})
        self.assertTrue(res.data["in_stock"] and res.data["sold_by_weight"])


class CaisseListeFormatsTests(FormatsTests):
    """La liste des produits de la caisse transmet les formats (prix, stock) et la vente au poids."""

    def test_liste_caisse(self):
        from apps.accounts.models import CashierProfile

        user = User.objects.create_user("caisse-liste")
        CashierProfile.objects.create(user=user, point_of_sale=self.store)
        client = APIClient()
        client.force_authenticate(user)
        res = client.get("/api/pos/products/")
        self.assertEqual(res.status_code, 200, res.data)
        par_nom = {p["name"]: p for p in res.data["results"]}
        riz = par_nom["Riz brise"]
        self.assertEqual([(v["label"], v["effective_price"], v["stock"]) for v in riz["variants"]], [("1 kg", "700.00", 10), ("Sac 25 kg", "15000.00", 2)])
        self.assertEqual(riz["stock"], 12)  # somme des formats : le produit n'est pas affiche en rupture
        self.assertTrue(par_nom["Tomates"]["sold_by_weight"])
        self.assertEqual(par_nom["Sucre 1kg"]["variants"], [])
