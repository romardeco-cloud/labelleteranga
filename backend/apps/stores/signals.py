"""
Supermarches lies (Mbour-Saly et Ziguinchor) : un produit ajoute a l'un est automatiquement ajoute a l'autre, visible
et vendu tout de suite (memes prix et formats : le produit est partage), avec son propre stock (meme reglage de suivi,
quantite 0) et sa categorie dans les rayons du magasin.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Stock

SUPERMARCHES_LIES = {"supermarche", "supermarche-la-belle-teranga-ziguinchor"}


@receiver(post_save, sender=Stock)
def ajouter_au_supermarche_lie(sender, instance, created, raw=False, **kwargs):
    if not created or raw:
        return
    from .models import PointOfSale, StoreCategory

    source = instance.point_of_sale
    if source.slug not in SUPERMARCHES_LIES:
        return
    for autre in PointOfSale.objects.filter(slug__in=SUPERMARCHES_LIES).exclude(pk=source.pk):
        Stock.objects.get_or_create(product_id=instance.product_id, point_of_sale=autre, defaults={"quantity": 0, "track_stock": instance.track_stock})
        category_id = instance.product.category_id
        if category_id and not StoreCategory.objects.filter(point_of_sale=autre, category_id=category_id).exists():
            StoreCategory.objects.create(point_of_sale=autre, category_id=category_id, order=StoreCategory.objects.filter(point_of_sale=autre).count())


from .models import StoreSettings  # noqa: E402


@receiver(post_save, sender=StoreSettings)
def vider_cache_majoration(sender, instance, **kwargs):
    """Supplement modifie dans les parametres : pris en compte tout de suite (pas apres l'expiration du cache)."""
    from .services import _MAJORATION

    _MAJORATION.pop(instance.point_of_sale_id, None)
