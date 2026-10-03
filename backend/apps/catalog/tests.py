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

    def test_delete_without_store_removes_products_everywhere(self):
        shared = self._product("partage", self.store, self.other)
        kept = self._product("garde", self.store)
        res = self.client.post(
            "/api/catalog/products/bulk-update/", {"ids": [shared.pk], "action": "delete", "confirm": True}, format="json"
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["updated"], 1)
        self.assertFalse(Product.objects.filter(pk=shared.pk).exists())
        self.assertFalse(Stock.objects.filter(product_id=shared.pk).exists())
        self.assertTrue(Product.objects.filter(pk=kept.pk).exists())

    def test_other_actions_still_require_store(self):
        p = self._product(1, self.store)
        res = self.client.post("/api/catalog/products/bulk-update/", {"ids": [p.pk], "action": "deactivate"}, format="json")
        self.assertEqual(res.status_code, 400)
        res = self.client.post("/api/catalog/products/bulk-update/", {"ids": [p.pk], "action": "delete"}, format="json")
        self.assertEqual(res.status_code, 400)  # sans confirm=true
        self.assertTrue(Product.objects.filter(pk=p.pk).exists())


class CategoriesByStoreTests(TestCase):
    """Admin > Produits : avec un point de vente choisi, seules ses categories (celles de ses produits) sont proposees."""

    def test_categories_filtered_by_store(self):
        from apps.catalog.models import Category

        client = APIClient()
        client.force_authenticate(User.objects.create_user("admin-cat", is_staff=True))
        sm, resto = PointOfSale.objects.create(name="SM"), PointOfSale.objects.create(name="Resto")
        fruits, plats, vide = (Category.objects.create(name=n) for n in ("Fruits", "Plats", "Vide"))
        for i, (cat, store) in enumerate([(fruits, sm), (fruits, sm), (plats, resto)]):
            p = Product.objects.create(sku=f"C-{i}", name=f"P{i}", price=100, category=cat)
            Stock.objects.create(product=p, point_of_sale=store)

        def names(params):
            res = client.get("/api/catalog/categories/", params)
            return sorted(c["name"] for c in res.data.get("results", res.data))

        self.assertEqual(names({"point_of_sale": sm.pk}), ["Fruits"])
        self.assertEqual(names({"point_of_sale": resto.pk}), ["Plats"])
        self.assertTrue({"Fruits", "Plats", "Vide"} <= set(names({"page_size": 100})))  # sans filtre : toutes
        # categorie rattachee au point de vente mais encore vide : visible aussi
        from apps.stores.models import StoreCategory

        StoreCategory.objects.create(point_of_sale=sm, category=vide)
        self.assertEqual(names({"point_of_sale": sm.pk}), ["Fruits", "Vide"])
        # creee depuis Admin > Produits avec un point de vente : rattachee automatiquement
        client.post("/api/catalog/categories/", {"name": "Glaces", "point_of_sale": resto.pk}, format="json")
        self.assertEqual(names({"point_of_sale": resto.pk}), ["Glaces", "Plats"])


class PriceZoneTests(TestCase):
    """Zone de la photo ou un prix est deja ecrit : le site la recouvre avec le prix actuel."""

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(User.objects.create_user("admin-zone", is_staff=True))
        self.p = Product.objects.create(sku="Z-1", name="Carotte 1kg", price=600)

    def test_zone_saved_normalised_and_cleared(self):
        url = f"/api/catalog/products/{self.p.pk}/"
        res = self.client.patch(url, {"price_zone": {"x": 0.6, "y": 0.7, "w": 0.6, "h": 0.2, "bg": "#d6283a", "fg": "bad", "contenu": "poids_prix"}}, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        z = res.data["price_zone"]
        self.assertEqual((z["x"], z["w"], z["bg"], z["fg"], z["contenu"]), (0.6, 0.4, "#d6283a", "#14213d", "poids_prix"))
        # changer le prix ne touche pas la zone
        res = self.client.patch(url, {"price": 700}, format="json")
        self.assertEqual(res.data["price_zone"]["x"], 0.6)
        # zone hors de la photo refusee, null efface
        self.assertEqual(self.client.patch(url, {"price_zone": {"x": 1.2, "y": 0, "w": 0.1, "h": 0.1}}, format="json").status_code, 400)
        self.assertIsNone(self.client.patch(url, {"price_zone": None}, format="json").data["price_zone"])
        # zone du poids facultative, separee du prix
        res = self.client.patch(url, {"price_zone": {"x": 0.5, "y": 0.7, "w": 0.4, "h": 0.2, "poids": {"x": 0.05, "y": 0.68, "w": 0.4, "h": 0.12, "bg": "#1f6f43"}}}, format="json")
        self.assertEqual(res.data["price_zone"]["poids"], {"x": 0.05, "y": 0.68, "w": 0.4, "h": 0.12, "bg": "#1f6f43", "fg": "#14213d"})

    def test_new_photo_resets_zone(self):
        import io

        from PIL import Image

        self.p.price_zone = {"x": 0.1, "y": 0.1, "w": 0.2, "h": 0.2}
        self.p.save()
        buf = io.BytesIO()
        Image.new("RGB", (20, 20), "white").save(buf, "PNG")
        buf.name = "photo.png"
        buf.seek(0)
        res = self.client.patch(f"/api/catalog/products/{self.p.pk}/", {"image": buf}, format="multipart")
        self.assertEqual(res.status_code, 200, res.data)
        self.p.refresh_from_db()
        self.assertIsNone(self.p.price_zone)


def _affiche_resto(avec_prix=True):
    """Affiche synthetique au style du Resto : photo claire en haut, bandeau bordeaux, medaillon dore a droite."""
    from PIL import Image, ImageDraw

    img = Image.new("RGB", (1000, 1000), (205, 190, 170))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 520, 1000, 1000], fill=(110, 13, 13))
    d.ellipse([760, 420, 940, 600], fill=(222, 178, 91), outline=(245, 230, 200), width=6)
    if avec_prix:
        for i in range(4):  # "1500" : 4 chiffres epais
            d.rectangle([792 + i * 30, 482, 803 + i * 30, 520], fill=(108, 25, 4))
        d.rectangle([815, 535, 885, 542], fill=(108, 25, 4))  # "FCFA"
    return img


class PriceZoneDetectionTests(TestCase):
    """Nouvelle photo envoyee : le prix dessine sur une affiche du Resto est repere tout seul."""

    def test_detecte_le_medaillon_et_rien_sur_une_photo_simple(self):
        from PIL import Image

        from apps.catalog.zone_detect import detecter_medaillon

        z = detecter_medaillon(_affiche_resto())
        self.assertIsNotNone(z)
        self.assertTrue(0.76 < z["x"] < 0.82 and 0.45 < z["y"] < 0.5, z)
        self.assertEqual(z["forme"], "ovale")
        self.assertIsNone(detecter_medaillon(_affiche_resto(avec_prix=False)))
        self.assertIsNone(detecter_medaillon(Image.new("RGB", (800, 800), (230, 180, 90))))

    def test_envoi_photo_definit_la_zone(self):
        import io

        client = APIClient()
        client.force_authenticate(User.objects.create_user("admin-auto", is_staff=True))
        p = Product.objects.create(sku="R-1", name="Thiep", price=1500)
        buf = io.BytesIO()
        _affiche_resto().save(buf, "PNG")
        buf.name = "affiche.png"
        buf.seek(0)
        res = client.patch(f"/api/catalog/products/{p.pk}/", {"image": buf}, format="multipart")
        self.assertEqual(res.status_code, 200, res.data)
        p.refresh_from_db()
        self.assertIsNotNone(p.price_zone)
        self.assertEqual(p.price_zone["forme"], "ovale")
