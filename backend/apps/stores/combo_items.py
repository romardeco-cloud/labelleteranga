"""Contenu des combos (Admin > Combos) affiche sur le produit du meme nom : site web et caisse."""

import re
import unicodedata


def norm_name(text):
    return re.sub(r"[^a-z0-9]+", "", unicodedata.normalize("NFKD", str(text or "")).encode("ascii", "ignore").decode().lower())


def combo_items_map(store):
    """{nom normalise du combo: [elements]} pour un point de vente (les lignes de « Contenu » du combo, dans l'ordre)."""
    from .models import Combo

    out = {}
    for combo in Combo.objects.filter(point_of_sale=store):
        lines = [l.strip() for l in (combo.includes or "").splitlines() if l.strip()]
        if lines:
            out[norm_name(combo.name)] = lines
    return out
