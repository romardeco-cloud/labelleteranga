"""Choix par impression du cachet, de la signature et de la mention certifiee : ?seal=mention,stamp,signature (ou seal=none)."""
import threading

_local = threading.local()
ITEMS = ("mention", "stamp", "signature")


def current():
    """dict {mention, stamp, signature} demande pour la requete en cours, ou None (= reglages par defaut de l'entreprise)."""
    return getattr(_local, "opts", None)


class SealOptionsMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        raw = request.GET.get("seal")
        if raw is None:
            _local.opts = None
        else:
            chosen = {x.strip() for x in raw.split(",")}
            _local.opts = {k: k in chosen for k in ITEMS}
        try:
            return self.get_response(request)
        finally:
            _local.opts = None
