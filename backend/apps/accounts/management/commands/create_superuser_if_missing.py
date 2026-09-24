import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    """
    Cree un compte admin a partir des variables d'environnement
    DJANGO_SUPERUSER_USERNAME / DJANGO_SUPERUSER_PASSWORD / DJANGO_SUPERUSER_EMAIL,
    uniquement s'il n'existe pas deja. Sans effet si ces variables ne sont
    pas renseignees. Concu pour etre appele a chaque build (idempotent).

    Recuperation de mot de passe oublie : si ADMIN_PASSWORD_RESET est renseignee (Render > Environment),
    le mot de passe du compte DJANGO_SUPERUSER_USERNAME est immediatement remplace par sa valeur au prochain
    deploiement. Retirer ensuite cette variable pour eviter de reinitialiser le mot de passe a chaque build.
    """

    help = "Cree le compte admin initial a partir des variables d'environnement, si absent."

    def handle(self, *args, **options):
        username = os.environ.get("DJANGO_SUPERUSER_USERNAME")
        password = os.environ.get("DJANGO_SUPERUSER_PASSWORD")
        email = os.environ.get("DJANGO_SUPERUSER_EMAIL", "")

        User = get_user_model()

        reset_password = os.environ.get("ADMIN_PASSWORD_RESET")
        if reset_password and username:
            user = User.objects.filter(username=username).first()
            if user:
                user.set_password(reset_password)
                user.save(update_fields=["password"])
                self.stdout.write(self.style.SUCCESS(f"Mot de passe de '{username}' reinitialise depuis ADMIN_PASSWORD_RESET."))
                return

        if not username or not password:
            self.stdout.write("DJANGO_SUPERUSER_USERNAME/PASSWORD non renseignes, aucun compte cree.")
            return

        if User.objects.filter(username=username).exists():
            self.stdout.write(f"Le compte '{username}' existe deja, rien a faire.")
            return

        User.objects.create_superuser(username=username, email=email, password=password)
        self.stdout.write(self.style.SUCCESS(f"Compte admin '{username}' cree."))
