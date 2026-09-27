from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    """
    Transfere du stock d'un point de vente vers un autre en une seule operation fiable et tracee, au lieu de
    deux corrections manuelles separees (une sortie ici, une entree la-bas) qu'on peut oublier de faire des
    deux cotes. A lancer depuis le Shell de Render (backend > Shell), par ex. :

        python manage.py transfer_stock --sku ABC123 --from supermarche --to quincaillerie --quantity 10

    --from/--to sont les identifiants de site (slug) des points de vente : celui qui apparait dans leur
    adresse web (ex. "supermarche" pour supermarche.labelleteranga.com). --product accepte aussi l'id
    numerique du produit a la place de --sku.
    """

    help = "Transfere une quantite de stock d'un point de vente vers un autre, avec tracabilite."

    def add_arguments(self, parser):
        parser.add_argument("--sku", help="Reference (SKU) du produit a transferer.")
        parser.add_argument("--product", type=int, help="Id numerique du produit, a la place de --sku.")
        parser.add_argument("--from", dest="from_slug", required=True, help="Identifiant de site (slug) du point de vente d'origine.")
        parser.add_argument("--to", dest="to_slug", required=True, help="Identifiant de site (slug) du point de vente de destination.")
        parser.add_argument("--quantity", type=int, required=True, help="Quantite a transferer (nombre entier positif).")
        parser.add_argument("--user", help="Nom d'utilisateur a associer au mouvement (facultatif, pour la tracabilite).")

    def handle(self, *args, **options):
        from apps.catalog.models import Product
        from apps.stores.models import PointOfSale
        from apps.stores.services import transfer_stock

        if not options["sku"] and not options["product"]:
            raise CommandError("Precisez --sku ou --product pour identifier le produit a transferer.")

        product_qs = Product.objects.all()
        product = (
            product_qs.filter(pk=options["product"]).first()
            if options["product"]
            else product_qs.filter(sku=options["sku"]).first()
        )
        if not product:
            raise CommandError("Produit introuvable avec ces criteres.")

        from_store = PointOfSale.objects.filter(slug=options["from_slug"]).first()
        if not from_store:
            raise CommandError(f"Aucun point de vente avec l'identifiant de site '{options['from_slug']}'.")
        to_store = PointOfSale.objects.filter(slug=options["to_slug"]).first()
        if not to_store:
            raise CommandError(f"Aucun point de vente avec l'identifiant de site '{options['to_slug']}'.")

        user = None
        if options["user"]:
            user = get_user_model().objects.filter(username=options["user"]).first()
            if not user:
                raise CommandError(f"Utilisateur '{options['user']}' introuvable.")

        out_movement, in_movement = transfer_stock(product, from_store, to_store, options["quantity"], user=user)
        self.stdout.write(
            self.style.SUCCESS(
                f"OK : {options['quantity']} x '{product.name}' transferes de {from_store.name} vers {to_store.name}. "
                f"Nouveau stock : {from_store.name}={out_movement.quantity_after}, {to_store.name}={in_movement.quantity_after}."
            )
        )
