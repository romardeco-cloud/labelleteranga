from django.db import transaction
from rest_framework.exceptions import ValidationError

from .models import Stock, StockMovement


def special_prices_map(store):
    """{produit: prix special} des speciaux du jour publies aujourd'hui pour ce point de vente (une seule requete)."""
    from django.utils import timezone

    from .models import DailyMenuItem

    if not store:
        return {}
    rows = DailyMenuItem.objects.filter(
        menu__point_of_sale=store,
        menu__date=timezone.localdate(),
        menu__kind="special",
        menu__is_published=True,
        special_price__isnull=False,
    ).values_list("product_id", "special_price")
    return dict(rows)


def price_for(product, store, specials=None):
    """(prix a payer, libelle) : promotion en cours et/ou special du jour, le prix le plus bas l'emporte."""
    price, label = product.price, None
    promo = product.active_promotion(store)
    if promo:
        price, label = promo.discounted_price(product.price), promo.name
    special = (specials if specials is not None else special_prices_map(store)).get(product.id)
    if special is not None and special < price:
        price, label = special, "Special du jour"
    return price, label


@transaction.atomic
def change_stock(product, store, *, reason, delta=None, set_to=None, reference="", user=None):
    """
    Point d'entree UNIQUE pour toute variation de stock : met a jour la quantite du
    (produit, point de vente) et ecrit une ligne dans le journal des mouvements.
    Utiliser soit `delta` (variation relative), soit `set_to` (nouvelle quantite).
    Retourne le mouvement cree, ou None si la quantite ne change pas.
    """
    if (delta is None) == (set_to is None):
        raise ValueError("Preciser delta OU set_to.")

    stock, _ = Stock.objects.select_for_update().get_or_create(product=product, point_of_sale=store)
    new_quantity = stock.quantity + delta if delta is not None else set_to
    if new_quantity < 0:
        raise ValidationError({"items": f"Stock insuffisant pour '{product.name}' (disponible : {stock.quantity})."})

    change = new_quantity - stock.quantity
    if change == 0:
        return None

    stock.quantity = new_quantity
    stock.save(update_fields=["quantity", "updated_at"])
    return StockMovement.objects.create(
        product=product,
        point_of_sale=store,
        delta=change,
        quantity_after=new_quantity,
        reason=reason,
        reference=reference[:60],
        user=user,
    )
