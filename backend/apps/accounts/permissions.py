from rest_framework.permissions import BasePermission


class IsCashier(BasePermission):
    """Utilisateur connecte disposant d'un profil caissier actif."""

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated and user.is_active):
            return False
        profile = getattr(user, "cashier_profile", None)
        return bool(profile and profile.is_active)
