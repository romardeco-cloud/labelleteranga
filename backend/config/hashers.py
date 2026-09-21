"""Hachage de mot de passe plus rapide : PBKDF2 avec moins d'iterations (la valeur par defaut de Django, 1 million, prend plusieurs secondes sur un petit serveur)."""

import os

from django.contrib.auth.hashers import PBKDF2PasswordHasher


class FastPBKDF2PasswordHasher(PBKDF2PasswordHasher):
    # meme algorithme (pbkdf2_sha256) : les anciens mots de passe restent valides et sont recalcules avec ce nombre a la prochaine connexion
    iterations = int(os.environ.get("PASSWORD_HASH_ITERATIONS", "150000"))
