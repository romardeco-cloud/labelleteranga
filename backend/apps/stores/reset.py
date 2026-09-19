"""
Remise a zero des donnees de test d'un point de vente avant le demarrage officiel (comptabilite, site, caisse, POS).
Supprime les transactions ; conserve la configuration (produits, prix, categories, parametres, caissiers, menus, clients/fournisseurs).
"""

import io

import openpyxl
from django.db import transaction

from .models import ComboRequest, DailyMenu, DrawerOpening, InventoryCount, LoyaltyMember, Review, Stock, StockMovement


def _querysets(store):
    from apps.cart.models import Cart
    from apps.documents.models import Invoice, PurchaseOrder, Quote
    from apps.orders.models import Order, OrderItem
    from apps.reports.models import DailyClosing

    orders = Order.objects.filter(point_of_sale=store)
    return {
        "orders": orders,
        "order_items": OrderItem.objects.filter(order__in=orders),
        "closings": DailyClosing.objects.filter(point_of_sale=store),
        "drawer": DrawerOpening.objects.filter(point_of_sale=store),
        "movements": StockMovement.objects.filter(point_of_sale=store),
        "inventories": InventoryCount.objects.filter(point_of_sale=store),
        "quotes": Quote.objects.filter(point_of_sale=store),
        "invoices": Invoice.objects.filter(point_of_sale=store),
        "purchase_orders": PurchaseOrder.objects.filter(point_of_sale=store),
        "reviews": Review.objects.filter(point_of_sale=store),
        "loyalty_members": LoyaltyMember.objects.filter(point_of_sale=store),
        "combo_requests": ComboRequest.objects.filter(point_of_sale=store),
        "carts": Cart.objects.filter(point_of_sale=store),
    }


LABELS = {
    "orders": "Ventes et commandes",
    "order_items": "Lignes de vente",
    "closings": "Clotures / fermetures de caisse",
    "drawer": "Ouvertures du tiroir-caisse",
    "movements": "Mouvements de stock",
    "inventories": "Inventaires",
    "quotes": "Devis",
    "invoices": "Factures",
    "purchase_orders": "Bons de commande",
    "reviews": "Avis clients",
    "loyalty_members": "Clients fideles (points et recompenses)",
    "combo_requests": "Demandes de combos",
    "carts": "Paniers en cours",
}


def counts(store):
    return {key: {"label": LABELS[key], "count": qs.count()} for key, qs in _querysets(store).items()}


def backup_xlsx(store):
    """Sauvegarde Excel de toutes les transactions qui vont etre supprimees (a conserver avant la remise a zero)."""
    qs = _querysets(store)
    wb = openpyxl.Workbook()
    wb.remove(wb.active)

    def sheet(title, headers, rows):
        ws = wb.create_sheet(title[:31])
        ws.append(headers)
        for r in rows:
            ws.append(list(r))
        for i, h in enumerate(headers, start=1):
            ws.column_dimensions[openpyxl.utils.get_column_letter(i)].width = max(14, len(h) + 4)

    d = lambda v: v.replace(tzinfo=None) if getattr(v, "tzinfo", None) else v
    sheet(
        "Ventes",
        ["Reference", "Date", "Canal", "Caissier", "Client", "Telephone", "Paiement", "Statut", "Total", "Pourboire", "Remise fidelite", "Motif annulation"],
        [
            [o.reference[:8].upper(), d(o.created_at), o.channel, o.cashier.username if o.cashier else "", o.customer_name, o.customer_phone, o.payment_method, o.status, float(o.total_amount), float(o.tip_amount), float(o.discount_amount), o.void_reason]
            for o in qs["orders"].select_related("cashier")
        ],
    )
    sheet(
        "Lignes de vente",
        ["Vente", "Produit", "Quantite", "Prix unitaire"],
        [[i.order.reference[:8].upper(), i.product_name, i.quantity, float(i.unit_price)] for i in qs["order_items"].select_related("order")],
    )
    sheet(
        "Clotures",
        ["Date", "Caissier", "Attendu especes", "Compte especes", "Attendu Wave", "Compte Wave", "Attendu Orange Money", "Compte Orange Money", "Attendu carte", "Compte carte", "Notes"],
        [
            [c.date, c.cashier.username if c.cashier else "Globale", float(c.expected_cash), float(c.declared_cash), float(c.expected_wave), float(c.declared_wave), float(c.expected_orange_money), float(c.declared_orange_money), float(c.expected_card), float(c.declared_card), c.notes]
            for c in qs["closings"].select_related("cashier")
        ],
    )
    sheet(
        "Mouvements de stock",
        ["Date", "Produit", "Variation", "Quantite apres", "Motif", "Reference"],
        [[d(m.created_at), m.product.name, m.delta, m.quantity_after, m.reason, m.reference] for m in qs["movements"].select_related("product")],
    )
    docs = []
    for label, key in (("Devis", "quotes"), ("Facture", "invoices"), ("Bon de commande", "purchase_orders")):
        for x in qs[key]:
            party = getattr(x, "customer", None) or getattr(x, "supplier", None)
            docs.append([label, x.number, x.date, party.name if party else "", float(x.total), getattr(x, "status", "")])
    sheet("Documents", ["Type", "Numero", "Date", "Tiers", "Total", "Statut"], docs)
    sheet("Avis", ["Date", "Client", "Service", "Qualite", "Commentaire"], [[d(r.created_at), r.customer_name, r.service_rating, r.quality_rating, r.comment] for r in qs["reviews"]])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@transaction.atomic
def reset_store(store, include_stock_levels=False):
    """Supprime les transactions du point de vente. Renvoie le nombre d'elements supprimes par rubrique."""
    from apps.documents.models import DocumentSequence, Invoice, PurchaseOrder, Quote

    qs = _querysets(store)
    done = {k: v.count() for k, v in qs.items()}
    # ordre : ce qui depend d'autre chose d'abord
    qs["inventories"].delete()
    qs["closings"].delete()
    qs["drawer"].delete()
    qs["movements"].delete()
    for key in ("quotes", "invoices", "purchase_orders"):
        qs[key].delete()
    qs["orders"].delete()  # supprime aussi les lignes de vente
    qs["reviews"].delete()
    qs["loyalty_members"].delete()  # et leurs recompenses
    qs["combo_requests"].delete()
    qs["carts"].delete()
    if include_stock_levels:
        Stock.objects.filter(point_of_sale=store).update(quantity=0)
    # numerotation des documents : repart de 1 si plus aucun document de ce type n'existe
    for kind, model in (("quote", Quote), ("invoice", Invoice), ("po", PurchaseOrder), ("inventory", InventoryCount)):
        if not model.objects.exists():
            DocumentSequence.objects.filter(kind=kind).update(last_number=0)
    return done
