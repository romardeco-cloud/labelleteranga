"""
Ligne de vente d'un produit selon son format ou son poids : prix unitaire, nom affiche (ticket, commande), et
suivi de stock. Point d'entree UNIQUE pour le panier en ligne, la commande et la caisse.

- produit avec formats actifs (ProductVariant) : un format est obligatoire ; prix = prix du format (promotion du
  produit appliquee dessus) ; stock suivi par format (VariantStock).
- produit vendu au poids (sold_by_weight) : un poids est obligatoire ; `price` = prix au kilo ; prix de la ligne =
  prix au kilo x poids, arrondi au franc ; pas de sortie de stock (stock compte en unites entieres).
- produit simple : comportement historique (price_for).
"""
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from rest_framework.exceptions import ValidationError

POIDS_MAX_KG = Decimal("1000")


@dataclass
class Ligne:
    variant: object  # ProductVariant | None
    weight_kg: object  # Decimal | None
    unit_price: Decimal
    nom: str  # nom affiche : "Riz brise - Sac 25 kg", "Tomates - 1,350 kg"
    label: str  # format ou poids seul ("" pour un produit simple)


def lire_poids(valeur):
    if valeur in (None, ""):
        return None
    try:
        poids = Decimal(str(valeur).replace(",", ".")).quantize(Decimal("0.001"))
    except (InvalidOperation, ValueError):
        raise ValidationError({"weight_kg": "Poids invalide."})
    if poids <= 0 or poids > POIDS_MAX_KG:
        raise ValidationError({"weight_kg": "Le poids doit etre compris entre 0,001 et 1000 kg."})
    return poids


def poids_texte(poids):
    t = f"{poids.normalize():f}".replace(".", ",")
    return f"{t} kg"


def formats_actifs(product):
    return [v for v in product.variants.all() if v.is_active]


def resoudre_ligne(product, store, variant_id=None, weight_kg=None, specials=None):
    from apps.stores.services import price_for

    formats = formats_actifs(product)
    if formats:
        variant = next((v for v in formats if variant_id is not None and v.pk == int(variant_id)), None)
        if variant is None:
            raise ValidationError({"variant": f"Choisissez un format pour {product.name}."})
        from apps.stores.services import prix_format_magasin

        base = prix_format_magasin(variant, store)
        promo = product.active_promotion(store)
        prix = promo.discounted_price(base) if promo else base
        return Ligne(variant, None, prix, f"{product.name} - {variant.label}", variant.label)
    if product.sold_by_weight:
        poids = lire_poids(weight_kg)
        if poids is None:
            raise ValidationError({"weight_kg": f"Indiquez le poids voulu pour {product.name}."})
        prix_kg = price_for(product, store, specials)[0]
        prix = (prix_kg * poids).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        return Ligne(None, poids, prix, f"{product.name} - {poids_texte(poids)}", poids_texte(poids))
    return Ligne(None, None, price_for(product, store, specials)[0], product.name, "")


def stock_format(variant, store):
    """Quantite du format dans le point de vente (0 si jamais saisie)."""
    from apps.stores.models import VariantStock

    row = VariantStock.objects.filter(variant=variant, point_of_sale=store).first()
    return row.quantity if row else 0
