from rest_framework import serializers

from apps.stores.serializers import StockSerializer

from .models import Category, Product, Promotion


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug"]


class ProductSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)
    category_id = serializers.PrimaryKeyRelatedField(
        source="category", queryset=Category.objects.all(), write_only=True, required=False, allow_null=True
    )
    total_stock = serializers.SerializerMethodField()
    stocks = StockSerializer(many=True, read_only=True)
    effective_price = serializers.SerializerMethodField()
    active_promotion_name = serializers.SerializerMethodField()
    in_stock = serializers.SerializerMethodField()
    store_stock = serializers.SerializerMethodField()
    combo_items = serializers.SerializerMethodField()
    variants = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id",
            "sku",
            "name",
            "slug",
            "description",
            "category",
            "category_id",
            "price",
            "compare_at_price",
            "effective_price",
            "active_promotion_name",
            "total_stock",
            "stocks",
            "unit",
            "image",
            "price_zone",
            "sold_by_weight",
            "variants",
            "is_active",
            "in_stock",
            "store_stock",
            "combo_items",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "slug", "created_at", "updated_at"]

    def validate_price_zone(self, value):
        """Accepte null (pas de zone) ou {x, y, w, h} en fraction de la photo, + couleurs et contenu facultatifs."""
        import json
        import re

        if value in (None, "", "null"):
            return None
        if isinstance(value, str):  # envoye via un formulaire multipart
            try:
                value = json.loads(value)
            except ValueError:
                raise serializers.ValidationError("Zone invalide.")
        if not isinstance(value, dict):
            raise serializers.ValidationError("Zone invalide.")
        try:
            zone = {k: round(float(value[k]), 4) for k in ("x", "y", "w", "h")}
        except (KeyError, TypeError, ValueError):
            raise serializers.ValidationError("La zone doit avoir x, y, w et h.")
        if not (0 <= zone["x"] < 1 and 0 <= zone["y"] < 1 and 0 < zone["w"] <= 1 and 0 < zone["h"] <= 1):
            raise serializers.ValidationError("La zone doit rester dans la photo.")
        zone["w"] = min(zone["w"], 1 - zone["x"])
        zone["h"] = min(zone["h"], 1 - zone["y"])
        for k, defaut in (("bg", "#ffffff"), ("fg", "#14213d")):
            c = str(value.get(k) or defaut)
            zone[k] = c if re.fullmatch(r"#[0-9a-fA-F]{6}", c) else defaut
        zone["contenu"] = "poids_prix" if value.get("contenu") == "poids_prix" else "prix"
        zone["forme"] = "ovale" if value.get("forme") == "ovale" else "rect"
        # zone facultative du poids, quand il est ecrit a part sur la photo (pastille "1 kg")
        pz = value.get("poids")
        if isinstance(pz, dict):
            try:
                zp = {k: round(float(pz[k]), 4) for k in ("x", "y", "w", "h")}
            except (KeyError, TypeError, ValueError):
                raise serializers.ValidationError("La zone du poids doit avoir x, y, w et h.")
            if not (0 <= zp["x"] < 1 and 0 <= zp["y"] < 1 and 0 < zp["w"] <= 1 and 0 < zp["h"] <= 1):
                raise serializers.ValidationError("La zone du poids doit rester dans la photo.")
            zp["w"] = min(zp["w"], 1 - zp["x"])
            zp["h"] = min(zp["h"], 1 - zp["y"])
            for k, defaut in (("bg", "#ffffff"), ("fg", "#14213d")):
                c = str(pz.get(k) or defaut)
                zp[k] = c if re.fullmatch(r"#[0-9a-fA-F]{6}", c) else defaut
            zone["poids"] = zp
        return zone

    def update(self, instance, validated_data):
        # nouvelle photo sans nouvelle zone : l'ancienne zone ne correspond plus a rien
        if "image" in validated_data and "price_zone" not in validated_data:
            validated_data["price_zone"] = None
        formats = self._formats_envoyes()
        product = super().update(instance, validated_data)
        if formats is not None:
            self._enregistrer_formats(product, formats)
        return product

    def create(self, validated_data):
        formats = self._formats_envoyes()
        product = super().create(validated_data)
        if formats is not None:
            self._enregistrer_formats(product, formats)
        return product

    # --- formats (taille, grandeur, poids conditionne) : liste complete envoyee dans "variants" -------------------
    def _formats_envoyes(self):
        """Liste [{id?, label, price, is_active?}] envoyee par l'admin, ou None si le champ n'est pas envoye."""
        import json
        from decimal import Decimal, InvalidOperation

        raw = self.initial_data.get("variants") if hasattr(self, "initial_data") else None
        if raw is None:
            return None
        if isinstance(raw, str):
            try:
                raw = json.loads(raw or "[]")
            except ValueError:
                raise serializers.ValidationError({"variants": "Formats invalides."})
        if not isinstance(raw, list):
            raise serializers.ValidationError({"variants": "Formats invalides."})
        out, vus = [], set()
        for i, f in enumerate(raw):
            label = str((f or {}).get("label") or "").strip()[:60]
            if not label:
                continue
            if label.lower() in vus:
                raise serializers.ValidationError({"variants": f"Le format « {label} » est en double."})
            vus.add(label.lower())
            try:
                prix = Decimal(str(f.get("price")).replace(",", ".").replace(" ", ""))
            except (InvalidOperation, TypeError):
                raise serializers.ValidationError({"variants": f"Prix invalide pour le format « {label} »."})
            if prix < 0:
                raise serializers.ValidationError({"variants": f"Prix invalide pour le format « {label} »."})
            out.append({"id": f.get("id"), "label": label, "price": prix, "order": i, "is_active": f.get("is_active", True) is not False})
        return out

    def _enregistrer_formats(self, product, formats):
        from .models import ProductVariant

        existants = {v.pk: v for v in product.variants.all()}
        gardes = set()
        for f in formats:
            v = existants.get(int(f["id"])) if str(f.get("id") or "").isdigit() else None
            if v is None:
                v = ProductVariant(product=product)
            v.label, v.price, v.order, v.is_active = f["label"], f["price"], f["order"], f["is_active"]
            v.save()
            gardes.add(v.pk)
        ProductVariant.objects.filter(product=product).exclude(pk__in=gardes).delete()
        if hasattr(product, "_prefetched_objects_cache"):
            product._prefetched_objects_cache.pop("variants", None)

    def get_variants(self, product):
        """Formats du produit, avec leur prix (promotion comprise) et leur stock (dans le point de vente du site, ou par magasin)."""
        from apps.stores.models import UNLIMITED_STOCK, VariantStock, tracks_stock

        formats = list(product.variants.all())
        if not formats:
            return []
        store = self.context.get("store")
        promo = product.active_promotion(store) if self._price_label(product)[1] and self._price_label(product)[1] != "Special du jour" else None
        stocks = {}
        for row in VariantStock.objects.filter(variant__in=formats):
            stocks.setdefault(row.variant_id, {})[row.point_of_sale_id] = row.quantity
        illimite = store is not None and (not tracks_stock(store) or self._store_quantity(product) == UNLIMITED_STOCK)
        out = []
        for v in formats:
            if store is not None and not v.is_active:
                continue  # site web : formats actifs seulement
            out.append({
                "id": v.id,
                "label": v.label,
                "price": str(v.price),
                "effective_price": str(promo.discounted_price(v.price) if promo else v.price),
                "is_active": v.is_active,
                "stock": (UNLIMITED_STOCK if illimite else stocks.get(v.id, {}).get(store.id, 0)) if store is not None else None,
                "stocks": stocks.get(v.id, {}),
            })
        return out

    def _total_stock(self, product):
        # somme en memoire sur les stocks deja precharges (prefetch_related) : evite une requete SQL par produit
        return sum(s.quantity for s in product.stocks.all())

    def get_total_stock(self, product):
        return self._total_stock(product)

    def get_combo_items(self, product):
        """Elements du combo du meme nom (site web d'un point de vente) ; liste vide pour un produit ordinaire."""
        store = self.context.get("store")
        if not store or "combo" not in product.name.lower():
            return []
        from apps.stores.combo_items import combo_items_map, norm_name

        cache = self.context.setdefault("_combo_items", {})
        if store.pk not in cache:
            cache[store.pk] = combo_items_map(store)
        return cache[store.pk].get(norm_name(product.name), [])

    def _store_quantity(self, product):
        store = self.context.get("store")
        if not store:
            return None
        from apps.stores.models import UNLIMITED_STOCK, tracks_stock

        if not tracks_stock(store):
            return UNLIMITED_STOCK  # pas de suivi de stock : toujours disponible
        row = next((s for s in product.stocks.all() if s.point_of_sale_id == store.id), None)
        if row is not None and not row.track_stock:
            return UNLIMITED_STOCK  # suivi desactive pour ce produit : toujours disponible
        return row.quantity if row else 0

    def get_store_stock(self, product):
        return self._store_quantity(product)

    def get_in_stock(self, product):
        if product.sold_by_weight and not [v for v in product.variants.all() if v.is_active]:
            return True  # vente au poids : pas de stock en unites
        formats = [v for v in self.get_variants(product) if v["is_active"]]
        if formats and self.context.get("store") is not None:
            return any((f["stock"] or 0) > 0 for f in formats)
        q = self._store_quantity(product)
        return self._total_stock(product) > 0 if q is None else q > 0

    def _price_label(self, product):
        from apps.stores.services import load_promotions, price_for, special_prices_map

        store = self.context.get("store")
        cache = self.context.setdefault("_specials", {})
        key = store.id if store else 0
        if key not in cache:
            cache[key] = special_prices_map(store)
        if "_promos" not in self.context:
            self.context["_promos"] = load_promotions()
        return price_for(product, store, cache[key], self.context["_promos"])

    def get_effective_price(self, product):
        return self._price_label(product)[0]

    def get_active_promotion_name(self, product):
        return self._price_label(product)[1]


class PromotionSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True, default=None)
    point_of_sale_name = serializers.CharField(source="point_of_sale.name", read_only=True, default=None)
    product_names = serializers.SerializerMethodField()
    is_current = serializers.SerializerMethodField()

    class Meta:
        model = Promotion
        fields = [
            "id",
            "name",
            "discount_type",
            "value",
            "category",
            "category_name",
            "products",
            "product_names",
            "point_of_sale",
            "point_of_sale_name",
            "start_date",
            "end_date",
            "is_active",
            "is_current",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def get_product_names(self, promo):
        return [p.name for p in promo.products.all()]

    def get_is_current(self, promo):
        return promo.is_current()
