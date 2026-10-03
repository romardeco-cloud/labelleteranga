"""Prix par magasin : supplement (transport) automatique et prix fixes propres a un magasin, sans effet sur les autres."""
from decimal import Decimal

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from apps.catalog.models import Product, ProductVariant
from apps.stores.models import PointOfSale, Stock, StoreSettings, VariantStock
from apps.stores.services import _MAJORATION


class PrixParMagasinTests(TestCase):
    def setUp(self):
        _MAJORATION.clear()
        self.mbour = PointOfSale.objects.create(name="SM Mbour test", slug="sm-mbour-test", online_enabled=True)
        self.zig = PointOfSale.objects.create(name="SM Zig test", slug="sm-zig-test", online_enabled=True)
        StoreSettings.objects.update_or_create(point_of_sale=self.zig, defaults={"price_markup_percent": Decimal("15"), "track_stock": False})
        StoreSettings.objects.update_or_create(point_of_sale=self.mbour, defaults={"track_stock": False})
        _MAJORATION.clear()
        self.sucre = Product.objects.create(sku="SUC-T", name="Sucre", price=700)
        self.riz = Product.objects.create(sku="RIZ-T", name="Riz", price=700)
        self.sac = ProductVariant.objects.create(product=self.riz, label="Sac 50 kg", price=22500)
        for p in (self.sucre, self.riz):
            Stock.objects.create(product=p, point_of_sale=self.mbour)
            Stock.objects.create(product=p, point_of_sale=self.zig)
        self.admin = APIClient()
        self.admin.force_authenticate(User.objects.create_user("admin-prix", is_staff=True))
        self.public = APIClient()

    def prix(self, client, product, slug):
        return client.get(f"/api/catalog/products/{product.pk}/", {"store": slug}).data

    def test_supplement_et_prix_fixe(self):
        # +15 % arrondi aux 25 F superieurs : 700 -> 805 -> 825 ; 22 500 -> 25 875 -> 25 875
        self.assertEqual(self.prix(self.public, self.sucre, "sm-zig-test")["price"], "825")
        self.assertEqual(self.prix(self.public, self.sucre, "sm-mbour-test")["price"], "700.00")
        self.assertEqual(self.prix(self.public, self.riz, "sm-zig-test")["variants"][0]["effective_price"], "25875")

        # prix fixe a Ziguinchor : Mbour ne change pas
        url = f"/api/catalog/products/{self.sucre.pk}/store-price/"
        self.assertEqual(self.admin.post(url, {"point_of_sale": self.zig.pk, "price": 900}, format="json").status_code, 200)
        res = self.admin.post(f"/api/catalog/products/{self.riz.pk}/store-price/", {"point_of_sale": self.zig.pk, "price": 24000, "variant": self.sac.pk}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(self.prix(self.public, self.sucre, "sm-zig-test")["price"], "900.00")
        self.assertEqual(self.prix(self.public, self.sucre, "sm-mbour-test")["price"], "700.00")
        self.assertEqual(self.prix(self.public, self.riz, "sm-zig-test")["variants"][0]["effective_price"], "24000.00")
        self.assertEqual(self.prix(self.public, self.riz, "sm-mbour-test")["variants"][0]["effective_price"], "22500.00")

        # changer le prix a Mbour (prix de base) : Ziguinchor garde son prix fixe
        self.admin.patch(f"/api/catalog/products/{self.sucre.pk}/", {"price": 750}, format="json")
        self.assertEqual(self.prix(self.public, self.sucre, "sm-zig-test")["price"], "900.00")
        self.assertEqual(self.prix(self.public, self.sucre, "sm-mbour-test")["price"], "750.00")
        # prix vide : retour au calcul automatique (750 + 15 % = 862,5 -> 875)
        self.admin.post(url, {"point_of_sale": self.zig.pk, "price": ""}, format="json")
        self.assertEqual(self.prix(self.public, self.sucre, "sm-zig-test")["price"], "875")

    def test_prix_groupe_a_ziguinchor_ne_touche_pas_mbour(self):
        res = self.admin.post(
            "/api/catalog/products/bulk-update/", {"ids": [self.sucre.pk], "point_of_sale": self.zig.pk, "action": "set_price", "price": 1000}, format="json"
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.sucre.refresh_from_db()
        self.assertEqual(self.sucre.price, 700)
        self.assertEqual(Stock.objects.get(product=self.sucre, point_of_sale=self.zig).price_override, 1000)

    def test_panier_et_caisse_au_prix_du_magasin(self):
        from apps.catalog.lignes import resoudre_ligne

        self.assertEqual(resoudre_ligne(self.sucre, self.zig).unit_price, Decimal("825"))
        self.assertEqual(resoudre_ligne(self.riz, self.zig, self.sac.pk).unit_price, Decimal("25875"))
        self.assertEqual(resoudre_ligne(self.sucre, self.mbour).unit_price, Decimal("700"))
        VariantStock.objects.create(variant=self.sac, point_of_sale=self.zig, price_override=24000)
        self.assertEqual(resoudre_ligne(self.riz, self.zig, self.sac.pk).unit_price, Decimal("24000"))


class TransfertStockTests(PrixParMagasinTests):
    """Transfert de stock entre magasins : produit simple et format, refuse si stock insuffisant."""

    def test_transfert(self):
        from apps.stores.models import StockMovement

        Stock.objects.filter(product=self.sucre, point_of_sale=self.mbour).update(quantity=30)
        VariantStock.objects.create(variant=self.sac, point_of_sale=self.mbour, quantity=10)
        url = f"/api/catalog/products/{self.sucre.pk}/transfer-stock/"
        res = self.admin.post(url, {"from_point_of_sale": self.mbour.pk, "to_point_of_sale": self.zig.pk, "quantity": 12}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(Stock.objects.get(product=self.sucre, point_of_sale=self.mbour).quantity, 18)
        self.assertEqual(Stock.objects.get(product=self.sucre, point_of_sale=self.zig).quantity, 12)
        self.assertEqual(StockMovement.objects.filter(product=self.sucre, reference__startswith="transfert").count(), 2)
        # format : obligatoire pour un produit a formats
        url = f"/api/catalog/products/{self.riz.pk}/transfer-stock/"
        self.assertEqual(self.admin.post(url, {"from_point_of_sale": self.mbour.pk, "to_point_of_sale": self.zig.pk, "quantity": 3}, format="json").status_code, 400)
        res = self.admin.post(url, {"from_point_of_sale": self.mbour.pk, "to_point_of_sale": self.zig.pk, "quantity": 3, "variant": self.sac.pk}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(VariantStock.objects.get(variant=self.sac, point_of_sale=self.mbour).quantity, 7)
        self.assertEqual(VariantStock.objects.get(variant=self.sac, point_of_sale=self.zig).quantity, 3)
        # stock insuffisant : rien ne bouge
        res = self.admin.post(url, {"from_point_of_sale": self.mbour.pk, "to_point_of_sale": self.zig.pk, "quantity": 50, "variant": self.sac.pk}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(VariantStock.objects.get(variant=self.sac, point_of_sale=self.zig).quantity, 3)
