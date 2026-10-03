from django.db import models
from django.utils.text import slugify


class Category(models.Model):
    name = models.CharField(max_length=120, unique=True)
    slug = models.SlugField(max_length=140, unique=True, blank=True)

    class Meta:
        verbose_name_plural = "Categories"
        ordering = ["name"]

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Product(models.Model):
    sku = models.CharField("Reference", max_length=64, unique=True)
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, unique=True, blank=True)
    description = models.TextField(blank=True)
    category = models.ForeignKey(
        Category, related_name="products", on_delete=models.SET_NULL, null=True, blank=True
    )
    price = models.DecimalField("Prix (XOF)", max_digits=12, decimal_places=2)
    compare_at_price = models.DecimalField(
        "Prix barre (XOF)", max_digits=12, decimal_places=2, null=True, blank=True
    )
    unit = models.CharField(max_length=32, default="unite", help_text="unite, kg, sac, etc.")
    image = models.ImageField(upload_to="products/", null=True, blank=True)
    # Zone de la photo ou un prix est deja ecrit (affiche, photo avec etiquette) : le site la recouvre avec le prix
    # actuel. {"x", "y", "w", "h"} en fraction de l'image (0 a 1), "bg"/"fg" couleurs, "contenu" : prix | poids_prix.
    price_zone = models.JSONField("Zone du prix sur la photo", null=True, blank=True)
    # vente au poids : `price` est alors le prix au kilo, le client/caissier choisit le poids (voir catalog/lignes.py)
    sold_by_weight = models.BooleanField("Vendu au poids (prix au kg)", default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.slug:
            base_slug = slugify(self.name)
            slug = base_slug
            i = 1
            while Product.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                i += 1
                slug = f"{base_slug}-{i}"
            self.slug = slug
        super().save(*args, **kwargs)

    @property
    def total_stock(self):
        return self.stocks.aggregate(total=models.Sum("quantity"))["total"] or 0

    @property
    def in_stock(self):
        return self.total_stock > 0

    def active_promotion(self, point_of_sale=None):
        """
        Promotion la plus avantageuse actuellement en cours pour ce produit
        (aucune promotion limitee a un point de vente n'est prise en compte
        cote boutique en ligne, sauf si point_of_sale est precise).
        """
        best = None
        best_price = self.price
        for promo in Promotion.objects.filter(is_active=True).current():
            if promo.point_of_sale_id and promo.point_of_sale_id != (point_of_sale.id if point_of_sale else None):
                continue
            if not promo.applies_to(self):
                continue
            candidate = promo.discounted_price(self.price)
            if candidate < best_price:
                best_price = candidate
                best = promo
        return best

    def __str__(self):
        return f"{self.name} ({self.sku})"



class ProductVariant(models.Model):
    """Format d'un produit (taille, grandeur, poids conditionne : "1 kg", "Sac 25 kg", "Grand"...) avec son propre prix.
    Un produit qui a des formats actifs se vend toujours par format ; son stock est suivi par format (VariantStock)."""

    product = models.ForeignKey(Product, related_name="variants", on_delete=models.CASCADE)
    label = models.CharField("Format", max_length=60)
    price = models.DecimalField("Prix (XOF)", max_digits=12, decimal_places=2)
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.product.name} - {self.label}"

class PromotionQuerySet(models.QuerySet):
    def current(self):
        from django.utils import timezone

        now = timezone.now()
        return self.filter(start_date__lte=now, end_date__gte=now)


class Promotion(models.Model):
    objects = PromotionQuerySet.as_manager()

    class DiscountType(models.TextChoices):
        PERCENT = "percent", "Pourcentage"
        FIXED = "fixed", "Montant fixe (FCFA)"

    name = models.CharField(max_length=150)
    discount_type = models.CharField(max_length=10, choices=DiscountType.choices, default=DiscountType.PERCENT)
    value = models.DecimalField(
        max_digits=10, decimal_places=2, help_text="Ex: 10 pour -10%% ou 500 pour -500 FCFA"
    )
    category = models.ForeignKey(
        Category, null=True, blank=True, on_delete=models.SET_NULL, related_name="promotions"
    )
    products = models.ManyToManyField(
        Product, blank=True, related_name="promotions", help_text="Laisser vide pour appliquer a toute la categorie / tout le catalogue."
    )
    point_of_sale = models.ForeignKey(
        "stores.PointOfSale",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="promotions",
        help_text="Laisser vide pour une promotion valable partout (y compris en ligne).",
    )
    start_date = models.DateTimeField()
    end_date = models.DateTimeField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-start_date"]

    def __str__(self):
        return self.name

    def is_current(self):
        from django.utils import timezone

        now = timezone.now()
        return self.is_active and self.start_date <= now <= self.end_date

    def applies_to(self, product):
        if self.products.exists():
            return self.products.filter(pk=product.pk).exists()
        if self.category_id:
            return product.category_id == self.category_id
        return True

    def discounted_price(self, price):
        if self.discount_type == self.DiscountType.PERCENT:
            discounted = price - (price * self.value / 100)
        else:
            discounted = price - self.value
        return max(discounted, 0)
