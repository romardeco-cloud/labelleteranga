from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.db import models
from django.utils import timezone
from rest_framework.exceptions import Throttled, ValidationError


class CashierProfile(models.Model):
    """
    Compte caissier : un utilisateur non-admin, rattache a un point de vente.
    Il ne peut acceder qu'a l'ecran de caisse (/caisse), jamais aux rapports,
    prix, clotures ou reglages.
    """

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="cashier_profile")
    point_of_sale = models.ForeignKey("stores.PointOfSale", on_delete=models.PROTECT, related_name="cashiers")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username} @ {self.point_of_sale.name}"


class AdminSecurityCode(models.Model):
    """
    Code secret a 4 chiffres de l'administrateur, demande pour les actions sensibles (annuler / supprimer une vente
    validee). Stocke chiffre (jamais en clair). Apres 5 essais faux, verrouillage 15 minutes.
    """

    pin_hash = models.CharField(max_length=128, blank=True)
    failed_attempts = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    # Code secondaire : meme usage (annuler / corriger une vente), mais utilisable par les caissiers depuis la
    # caisse elle-meme, sans leur donner le code principal. Seul le code principal permet de le definir/changer.
    secondary_pin_hash = models.CharField(max_length=128, blank=True)
    secondary_failed_attempts = models.PositiveSmallIntegerField(default=0)
    secondary_locked_until = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    MAX_ATTEMPTS = 5
    LOCK_MINUTES = 15

    @classmethod
    def current(cls):
        return cls.objects.first() or cls.objects.create()

    @property
    def is_set(self):
        return bool(self.pin_hash)

    @property
    def is_secondary_set(self):
        return bool(self.secondary_pin_hash)

    @staticmethod
    def validate_format(pin):
        if not isinstance(pin, str) or len(pin) != 4 or not pin.isdigit():
            raise ValidationError({"pin": "Le code doit contenir exactement 4 chiffres."})

    def set_pin(self, pin):
        self.validate_format(pin)
        self.pin_hash = make_password(pin)
        self.failed_attempts = 0
        self.locked_until = None
        self.save()

    def verify(self, pin):
        """Leve une erreur si le code est absent, verrouille ou faux ; remet le compteur a zero si correct."""
        if not self.is_set:
            raise ValidationError({"pin": "Aucun code secret defini : creez-le dans Parametres > Securite."})
        if self.locked_until and self.locked_until > timezone.now():
            raise Throttled(detail="Trop d'essais. Reessayez dans quelques minutes.")
        if not isinstance(pin, str) or not check_password(pin, self.pin_hash):
            self.failed_attempts += 1
            if self.failed_attempts >= self.MAX_ATTEMPTS:
                self.locked_until = timezone.now() + timezone.timedelta(minutes=self.LOCK_MINUTES)
                self.failed_attempts = 0
                self.save()
                raise Throttled(detail="Trop d'essais. Code bloque 15 minutes.")
            self.save()
            left = self.MAX_ATTEMPTS - self.failed_attempts
            raise ValidationError({"pin": f"Code secret incorrect ({left} essai(s) restant(s))."})
        if self.failed_attempts:
            self.failed_attempts = 0
            self.save(update_fields=["failed_attempts"])

    def set_secondary_pin(self, pin):
        self.validate_format(pin)
        self.secondary_pin_hash = make_password(pin)
        self.secondary_failed_attempts = 0
        self.secondary_locked_until = None
        self.save()

    def verify_secondary(self, pin):
        """Meme logique que verify(), pour le code secondaire (caisse) ; compteur d'essais independant du code principal."""
        if not self.is_secondary_set:
            raise ValidationError({"pin": "Aucun code caissier defini : demandez a l'administrateur de le creer dans Parametres > Securite."})
        if self.secondary_locked_until and self.secondary_locked_until > timezone.now():
            raise Throttled(detail="Trop d'essais. Reessayez dans quelques minutes.")
        if not isinstance(pin, str) or not check_password(pin, self.secondary_pin_hash):
            self.secondary_failed_attempts += 1
            if self.secondary_failed_attempts >= self.MAX_ATTEMPTS:
                self.secondary_locked_until = timezone.now() + timezone.timedelta(minutes=self.LOCK_MINUTES)
                self.secondary_failed_attempts = 0
                self.save()
                raise Throttled(detail="Trop d'essais. Code bloque 15 minutes.")
            self.save()
            left = self.MAX_ATTEMPTS - self.secondary_failed_attempts
            raise ValidationError({"pin": f"Code secret incorrect ({left} essai(s) restant(s))."})
        if self.secondary_failed_attempts:
            self.secondary_failed_attempts = 0
            self.save(update_fields=["secondary_failed_attempts"])
