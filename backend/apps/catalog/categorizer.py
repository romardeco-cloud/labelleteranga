"""Classement des produits par categorie : suggestion a partir du nom (catalogue de reference du supermarche) et rattachement aux points de vente."""

import json
import os
import re
import unicodedata

from apps.stores.models import StoreCategory

from .models import Category

_DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "supermarket_categories.json")
_REF = None


def _norm(text):
    text = unicodedata.normalize("NFKD", str(text or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "", text)


def _base(name):
    """Nom sans les parentheses ni la taille : « Riz parfume 25kg » -> « rizparfume »."""
    name = re.sub(r"\(.*?\)", "", name)
    name = re.sub(r"\b\d+([.,]\d+)?\s*(kg|g|l|cl|ml|litres?|pieces?|pcs|x)\b", "", name, flags=re.I)
    return _norm(name)


def reference():
    global _REF
    if _REF is None:
        raw = json.load(open(_DATA, encoding="utf-8"))
        _REF = [(_base(k), _norm(re.sub(r"\(.*?\)", "", k)), v) for k, v in raw.items()]
        _REF.sort(key=lambda t: -len(t[0]))  # les noms les plus precis d'abord
    return _REF


def guess_category(name):
    """Categorie probable d'un produit d'apres son nom, ou None."""
    base, full = _base(name), _norm(name)
    for ref_base, ref_full, category in reference():
        if not ref_base or len(ref_base) < 3:
            continue
        if base == ref_base or full == ref_full:
            return category
    for ref_base, _ref_full, category in reference():
        if len(ref_base) >= 4 and (base.startswith(ref_base) or ref_base in base) and len(ref_base) / max(len(base), 1) >= 0.6:
            return category
    return None


def get_category(name, cache=None):
    """Categorie existante (majuscules et accents ignores) ou nouvelle."""
    cache = cache if cache is not None else {}
    key = _norm(name)
    if key not in cache:
        found = next((c for c in Category.objects.all() if _norm(c.name) == key), None)
        cache[key] = found or Category.objects.create(name=name.strip())
    return cache[key]


def assign(product, category):
    """Met le produit dans la categorie et la rend visible (site, caisse, filtres) dans chaque point de vente qui le vend."""
    product.category = category
    product.save(update_fields=["category"])
    for store_id in product.stocks.values_list("point_of_sale_id", flat=True):
        StoreCategory.objects.get_or_create(
            point_of_sale_id=store_id,
            category=category,
            defaults={"order": StoreCategory.objects.filter(point_of_sale_id=store_id).count()},
        )
