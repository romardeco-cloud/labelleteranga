from django.db import models


class PointOfSale(models.Model):
    name = models.CharField("Nom", max_length=120, unique=True)
    address = models.CharField("Adresse", max_length=255, blank=True)
    phone = models.CharField("Telephone", max_length=30, blank=True)
    slug = models.SlugField("Identifiant du site", max_length=60, unique=True, null=True, blank=True)
    online_enabled = models.BooleanField("Site web en ligne", default=False)
    description = models.CharField("Description courte", max_length=200, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "Point de vente"
        verbose_name_plural = "Points de vente"

    def __str__(self):
        return self.name


class Stock(models.Model):
    product = models.ForeignKey("catalog.Product", related_name="stocks", on_delete=models.CASCADE)
    point_of_sale = models.ForeignKey(PointOfSale, related_name="stocks", on_delete=models.CASCADE)
    quantity = models.PositiveIntegerField(default=0)
    track_stock = models.BooleanField("Suivre le stock de ce produit", default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("product", "point_of_sale")
        verbose_name = "Stock"
        verbose_name_plural = "Stocks"

    def __str__(self):
        return f"{self.product.name} @ {self.point_of_sale.name} : {self.quantity}"


class StockMovement(models.Model):
    """Journal de chaque variation de stock (ventes, receptions, inventaires, corrections...)."""

    class Reason(models.TextChoices):
        SALE_POS = "sale_pos", "Vente en caisse"
        INVOICE = "invoice", "Facture client"
        INVOICE_CANCEL = "invoice_cancel", "Annulation de facture"
        PURCHASE_RECEIPT = "purchase_receipt", "Reception fournisseur"
        ONLINE_ORDER = "online_order", "Commande en ligne"
        SALE_VOID = "sale_void", "Vente annulee"
        MANUAL = "manual", "Correction manuelle"
        INVENTORY = "inventory", "Ajustement d'inventaire"
        IMPORT = "import", "Import Excel"

    product = models.ForeignKey("catalog.Product", related_name="stock_movements", on_delete=models.CASCADE)
    point_of_sale = models.ForeignKey(PointOfSale, related_name="stock_movements", on_delete=models.CASCADE)
    delta = models.IntegerField()
    quantity_after = models.PositiveIntegerField()
    reason = models.CharField(max_length=20, choices=Reason.choices)
    reference = models.CharField(max_length=60, blank=True)
    user = models.ForeignKey("auth.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"{self.product_id} @ {self.point_of_sale_id}: {self.delta:+d}"


class InventoryCount(models.Model):
    """Inventaire physique d'un point de vente : photo du stock theorique, comptage, puis ajustement."""

    class Status(models.TextChoices):
        DRAFT = "draft", "En cours"
        VALIDATED = "validated", "Valide"
        CANCELLED = "cancelled", "Annule"

    number = models.CharField(max_length=30, unique=True, editable=False)
    point_of_sale = models.ForeignKey(PointOfSale, related_name="inventory_counts", on_delete=models.PROTECT)
    date = models.DateField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey("auth.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    validated_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "-id"]

    def __str__(self):
        return self.number


class InventoryCountLine(models.Model):
    count = models.ForeignKey(InventoryCount, related_name="lines", on_delete=models.CASCADE)
    product = models.ForeignKey("catalog.Product", related_name="+", on_delete=models.CASCADE)
    theoretical_quantity = models.IntegerField()
    counted_quantity = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        unique_together = ("count", "product")
        ordering = ["product__name"]

    @property
    def variance(self):
        return None if self.counted_quantity is None else self.counted_quantity - self.theoretical_quantity


class StoreCategory(models.Model):
    """Categories affichees pour un point de vente (ordre, icone en caisse). Les categories elles-memes sont partagees."""

    point_of_sale = models.ForeignKey(PointOfSale, related_name="store_categories", on_delete=models.CASCADE)
    category = models.ForeignKey("catalog.Category", related_name="store_links", on_delete=models.CASCADE)
    order = models.PositiveIntegerField("Ordre", default=0)

    class Meta:
        unique_together = ("point_of_sale", "category")
        ordering = ["order", "category__name"]

    def __str__(self):
        return f"{self.point_of_sale} / {self.category}"


def default_payment_methods():
    return ["cash", "wave", "orange_money", "card"]


class StoreSettings(models.Model):
    """Parametres d'un point de vente (identite legale, finances, ticket, modules de la caisse)."""

    point_of_sale = models.OneToOneField(PointOfSale, related_name="settings", on_delete=models.CASCADE)
    timezone = models.CharField("Fuseau horaire", max_length=60, default="Africa/Dakar")
    email = models.EmailField(blank=True, default="info@labelleteranga.com")
    # informations legales
    legal_form = models.CharField("Forme juridique", max_length=60, blank=True)
    share_capital = models.DecimalField("Capital social", max_digits=14, decimal_places=0, null=True, blank=True)
    ninea = models.CharField("NINEA", max_length=60, blank=True)
    rccm = models.CharField("RCCM", max_length=60, blank=True)
    # finances
    vat_rate = models.DecimalField("TVA (%)", max_digits=5, decimal_places=2, default=0)
    prices_include_vat = models.BooleanField("Prix TTC", default=True)
    payment_methods = models.JSONField("Moyens de paiement acceptes", default=default_payment_methods)
    # apparence du ticket
    # liens de paiement marchand (contenus dans les QR codes Wave / Orange Money du point de vente) :
    # le client est envoye directement dans son application avec le compte marchand et le montant
    wave_pay_url = models.URLField("Lien de paiement Wave", max_length=300, blank=True)
    orange_pay_url = models.URLField("Lien de paiement Orange Money / Max it", max_length=300, blank=True)
    # numeros marchands : le client peut aussi payer en saisissant ce numero dans son application
    wave_number = models.CharField("Numero marchand Wave", max_length=30, blank=True)
    orange_number = models.CharField("Numero marchand Orange Money", max_length=30, blank=True)
    # suivi du stock : desactive (restaurant, plats faits a la commande) => jamais de rupture ni de sortie de stock
    track_stock = models.BooleanField("Suivi du stock", default=True)
    receipt_slogan = models.CharField(max_length=120, blank=True, default="L'art du service")
    receipt_footer = models.CharField(max_length=200, blank=True, default="Merci de votre visite !")
    # modules de la caisse
    module_hold = models.BooleanField("Ventes en attente", default=True)
    module_history = models.BooleanField("Historique du jour", default=True)
    module_qr = models.BooleanField("QR Wave / Orange Money", default=True)
    module_dine_in = models.BooleanField("Vente sur place (tables)", default=True)
    module_customer_orders = models.BooleanField("Commandes client", default=True)
    module_drawer = models.BooleanField("Tiroir-caisse", default=True)
    module_xreport = models.BooleanField("Rapport X", default=True)
    # reseaux sociaux du point de vente (cle -> lien ou numero) : facebook, instagram, tiktok, x, youtube, telegram, whatsapp, phone, website
    social_links = models.JSONField("Reseaux sociaux", default=dict, blank=True)
    # programme de fidelite : recompense apres N commandes OU apres un montant cumule (au choix du gerant)
    loyalty_enabled = models.BooleanField("Fidelite active", default=False)
    loyalty_mode = models.CharField(
        "Critere", max_length=10, choices=[("orders", "Nombre de commandes"), ("amount", "Montant cumule")], default="orders"
    )
    loyalty_threshold = models.PositiveIntegerField("Seuil (commandes ou FCFA)", default=10)
    loyalty_min_order = models.PositiveIntegerField("Montant minimum d'une commande comptee (FCFA)", default=0)
    loyalty_reward_type = models.CharField(
        "Type de recompense",
        max_length=10,
        choices=[("percent", "Reduction en %"), ("amount", "Reduction en FCFA"), ("gift", "Cadeau offert")],
        default="percent",
    )
    loyalty_reward_value = models.DecimalField("Valeur (% ou FCFA)", max_digits=10, decimal_places=0, default=10)
    loyalty_reward_label = models.CharField("Texte de la recompense", max_length=120, blank=True)
    loyalty_valid_days = models.PositiveIntegerField("Validite de la recompense (jours)", default=60)

    def __str__(self):
        return f"Parametres de {self.point_of_sale}"


UNLIMITED_STOCK = 9999


def tracks_stock(store, product=None):
    """
    False pour un point de vente sans suivi de stock (ex. restaurant), ou pour un produit dont le suivi est desactive dans
    ce point de vente (plat prepare, frais de livraison...) : quantite toujours disponible, aucune sortie de stock.
    """
    if store is None:
        return True
    if not get_settings(store).track_stock:
        return False
    if product is not None:
        flag = Stock.objects.filter(product=product, point_of_sale=store).values_list("track_stock", flat=True).first()
        if flag is False:
            return False
    return True


def untracked_product_ids(store):
    """Produits dont le suivi de stock est desactive dans ce point de vente (une seule requete)."""
    return set(Stock.objects.filter(point_of_sale=store, track_stock=False).values_list("product_id", flat=True)) if store else set()


def get_settings(store):
    settings, _ = StoreSettings.objects.get_or_create(point_of_sale=store)
    return settings


class DrawerOpening(models.Model):
    """Ouverture du tiroir-caisse hors vente (pour controle : qui, quand, pourquoi)."""

    point_of_sale = models.ForeignKey(PointOfSale, related_name="drawer_openings", on_delete=models.CASCADE)
    cashier = models.ForeignKey("auth.User", null=True, on_delete=models.SET_NULL, related_name="+")
    reason = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class DailyMenu(models.Model):
    """
    Selection du jour d'un point de vente, affichee dans l'application :
    - "lunch"   : menu du midi (plats numerotes) ;
    - "special" : specials du jour (produits mis en avant, avec un prix special facultatif).
    """

    class Kind(models.TextChoices):
        LUNCH = "lunch", "Menu du midi"
        SPECIAL = "special", "Speciaux du jour"

    point_of_sale = models.ForeignKey(PointOfSale, related_name="daily_menus", on_delete=models.CASCADE)
    date = models.DateField()
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.LUNCH)
    title = models.CharField(max_length=80, blank=True)
    note = models.CharField("Horaires / remarque", max_length=160, blank=True)
    is_published = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("point_of_sale", "date", "kind")
        ordering = ["-date"]

    def __str__(self):
        return f"{self.point_of_sale} - {self.get_kind_display()} - {self.date}"


class DailyMenuItem(models.Model):
    menu = models.ForeignKey(DailyMenu, related_name="items", on_delete=models.CASCADE)
    product = models.ForeignKey("catalog.Product", related_name="+", on_delete=models.CASCADE)
    number = models.PositiveIntegerField("Numero de choix")
    special_price = models.DecimalField("Prix special", max_digits=12, decimal_places=2, null=True, blank=True)

    class Meta:
        unique_together = (("menu", "product"), ("menu", "number"))
        ordering = ["number"]


def _reward_code():
    import secrets

    return "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(6))


class LoyaltyMember(models.Model):
    """Client fidele, identifie par son telephone, pour un point de vente."""

    point_of_sale = models.ForeignKey(PointOfSale, related_name="loyalty_members", on_delete=models.CASCADE)
    phone = models.CharField(max_length=20, db_index=True)  # chiffres seulement, sans indicatif
    name = models.CharField(max_length=150, blank=True)
    orders_count = models.PositiveIntegerField(default=0)
    total_spent = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    progress = models.DecimalField("Progression vers la prochaine recompense", max_digits=14, decimal_places=2, default=0)
    rewards_earned = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("point_of_sale", "phone")
        ordering = ["-updated_at"]


class LoyaltyReward(models.Model):
    member = models.ForeignKey(LoyaltyMember, related_name="rewards", on_delete=models.CASCADE)
    point_of_sale = models.ForeignKey(PointOfSale, related_name="loyalty_rewards", on_delete=models.CASCADE)
    code = models.CharField(max_length=8, unique=True, default=_reward_code)
    reward_type = models.CharField(max_length=10)
    value = models.DecimalField(max_digits=10, decimal_places=0, default=0)
    label = models.CharField(max_length=160)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    used_at = models.DateTimeField(null=True, blank=True)
    used_on_order = models.CharField(max_length=40, blank=True)

    class Meta:
        ordering = ["-created_at"]


class Review(models.Model):
    """Avis client : notes 1-5 (service, qualite), sondage de 3 questions et commentaire."""

    point_of_sale = models.ForeignKey(PointOfSale, related_name="reviews", on_delete=models.CASCADE)
    order_reference = models.CharField(max_length=40, blank=True, db_index=True)
    customer_name = models.CharField(max_length=100, blank=True)
    customer_phone = models.CharField(max_length=30, blank=True)
    service_rating = models.PositiveSmallIntegerField()
    quality_rating = models.PositiveSmallIntegerField()
    q_speed = models.PositiveSmallIntegerField("Rapidite du service", null=True, blank=True)
    q_welcome = models.PositiveSmallIntegerField("Accueil et amabilite", null=True, blank=True)
    q_recommend = models.CharField("Recommanderait", max_length=10, blank=True)  # yes | maybe | no
    dish = models.CharField("Plat / produit concerne", max_length=150, blank=True)
    comment = models.TextField(blank=True)
    is_published = models.BooleanField(default=True)
    comment_hidden = models.BooleanField("Commentaire retire du site (la note reste comptee)", default=False)
    reply = models.TextField("Reponse du commerce", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class Combo(models.Model):
    """Formule / combo pour un evenement (anniversaire, soiree entre amis, special week-end...), definie manuellement."""

    point_of_sale = models.ForeignKey(PointOfSale, related_name="combos", on_delete=models.CASCADE)
    name = models.CharField(max_length=120)
    occasion = models.CharField("Occasion", max_length=80, blank=True)
    description = models.TextField(blank=True)
    includes = models.TextField("Contenu (une ligne par element)", blank=True)
    serves = models.CharField("Pour combien de personnes", max_length=60, blank=True)
    price = models.DecimalField(max_digits=12, decimal_places=0, default=0)
    image = models.ImageField(upload_to="combos/", blank=True)
    weekend_only = models.BooleanField("Uniquement le week-end", default=False)
    starts_on = models.DateField(null=True, blank=True)
    ends_on = models.DateField(null=True, blank=True)
    min_notice_hours = models.PositiveIntegerField("Delai de reservation (heures)", default=24)
    is_active = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["order", "-created_at"]


class ComboRequest(models.Model):
    class Status(models.TextChoices):
        NEW = "new", "Nouvelle"
        CONFIRMED = "confirmed", "Confirmee"
        CANCELLED = "cancelled", "Annulee"

    point_of_sale = models.ForeignKey(PointOfSale, related_name="combo_requests", on_delete=models.CASCADE)
    combo = models.ForeignKey(Combo, related_name="requests", null=True, blank=True, on_delete=models.SET_NULL)
    combo_name = models.CharField(max_length=120)
    combo_price = models.DecimalField(max_digits=12, decimal_places=0, default=0)
    customer_name = models.CharField(max_length=100)
    customer_phone = models.CharField(max_length=30)
    event_date = models.DateField()
    guests = models.PositiveIntegerField(default=1)
    message = models.TextField(blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.NEW)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
