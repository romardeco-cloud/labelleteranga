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


COPIED_SETTINGS = [
    "timezone", "email", "legal_form", "share_capital", "ninea", "rccm", "vat_rate", "prices_include_vat", "payment_methods",
    "receipt_slogan", "receipt_footer", "module_hold", "module_history", "module_qr", "module_dine_in", "module_customer_orders",
    "module_drawer", "module_xreport", "loyalty_mode", "loyalty_threshold", "loyalty_min_order", "loyalty_reward_type",
    "loyalty_reward_value", "loyalty_reward_label", "loyalty_valid_days",
]


def unique_slug(name, exclude_pk=None):
    """Identifiant de site a partir du nom : 'Ferme La Belle Teranga' -> 'ferme'."""
    import re

    from django.utils.text import slugify

    from .models import PointOfSale

    base = slugify(re.sub(r"\s+La Belle Teranga$", "", name.strip(), flags=re.I)) or "site"
    slug, i = base, 2
    while PointOfSale.objects.filter(slug=slug).exclude(pk=exclude_pk).exists():
        slug, i = f"{base}-{i}", i + 1
    return slug


def bootstrap_store(store):
    """
    Donne a un nouveau point de vente tout ce que les autres ont : parametres (infos legales RCCM / NINEA, TVA,
    moyens de paiement, ticket, modules de caisse, fidelite, reseaux sociaux) copies du premier point de vente configure,
    identifiant de site, adresse web officielle.
    """
    from .models import PointOfSale, get_settings

    if not store.slug:
        store.slug = unique_slug(store.name, store.pk)
        store.save(update_fields=["slug"])
    st = get_settings(store)
    ref = (
        PointOfSale.objects.exclude(pk=store.pk).exclude(settings__rccm="").order_by("id").first()
        or PointOfSale.objects.exclude(pk=store.pk).order_by("id").first()
    )
    if ref:
        ref_st = get_settings(ref)
        for f in COPIED_SETTINGS:
            setattr(st, f, getattr(ref_st, f))
        links = {k: v for k, v in (ref_st.social_links or {}).items() if k != "website"}
        st.social_links = links
    links = dict(st.social_links or {})
    links.setdefault("website", f"https://{store.slug}.labelleteranga.com")
    st.social_links = links
    st.save()
    return store
