from django.db.models import Q
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsCashier
from apps.catalog.models import Product
from apps.orders.models import Order
from apps.stores.models import UNLIMITED_STOCK, DrawerOpening, Stock, StoreCategory, tracks_stock
from apps.stores.serializers import pos_settings
from apps.stores.services import price_for, special_prices_map

from django.utils import timezone

from apps.reports.models import DailyClosing
from apps.reports.serializers import DailyClosingSerializer

from .services import cashier_sales_totals, close_cashier_day, create_pos_sale


class POSProductListView(APIView):
    """GET /api/pos/products/?search=... - produits vendables avec le stock du magasin du caissier."""

    permission_classes = [IsCashier]

    def get(self, request):
        store = request.user.cashier_profile.point_of_sale
        # seuls les produits rattaches a ce point de vente (une ligne de stock, meme a 0)
        qs = Product.objects.filter(is_active=True, stocks__point_of_sale=store).select_related("category")
        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(sku__icontains=search))
        qs = qs.order_by("name")[:1000]

        tracked = tracks_stock(store)
        specials = special_prices_map(store)
        stock_by_product = dict(
            Stock.objects.filter(point_of_sale=store, product__in=qs).values_list("product_id", "quantity")
        )
        results = []
        for p in qs:
            price, promo_label = price_for(p, store, specials)
            results.append(
                {
                    "id": p.id,
                    "sku": p.sku,
                    "name": p.name,
                    "category": p.category.name if p.category else None,
                    "unit": p.unit,
                    "price": str(p.price),
                    "effective_price": str(price),
                    "promotion": promo_label,
                    "stock": stock_by_product.get(p.id, 0) if tracked else UNLIMITED_STOCK,
                    "image": request.build_absolute_uri(p.image.url) if p.image else None,
                }
            )
        from apps.stores.models import DailyMenu

        daily = {"lunch": [], "special": []}
        for menu in DailyMenu.objects.filter(point_of_sale=store, date=timezone.localdate(), is_published=True):
            daily[menu.kind] = [{"product": i.product_id, "number": i.number} for i in menu.items.all()]
        categories = [
            {"name": l.category.name, "order": l.order}
            for l in StoreCategory.objects.filter(point_of_sale=store).select_related("category")
        ]
        return Response(
            {"point_of_sale": store.name, "results": results, "categories": categories, "settings": pos_settings(store), "daily_menu": daily}
        )


METHOD_LABELS = {
    "cash": "Especes",
    "card": "Carte bancaire",
    "wave": "Wave",
    "orange_money": "Orange Money",
}


def receipt_payload(order, profile, received=None):
    """Donnees du ticket de caisse (vente et reimpression depuis l'historique)."""
    total = order.total_amount
    return {
        "reference": order.reference,
        "receipt_number": order.reference[:8].upper(),
        "created_at": order.created_at,
        "point_of_sale": profile.point_of_sale.name,
        "cashier": profile.user.username,
        "customer_name": order.customer_name,
        "table_label": order.table_label,
        "payment_method": order.payment_method,
        "payment_method_label": METHOD_LABELS.get(order.payment_method, order.payment_method),
        "items": [
            {
                "name": i.product_name,
                "quantity": i.quantity,
                "unit_price": str(i.unit_price),
                "subtotal": str(i.subtotal),
            }
            for i in order.items.all()
        ],
        "receipt_slogan": pos_settings(profile.point_of_sale)["receipt_slogan"],
        "receipt_footer": pos_settings(profile.point_of_sale)["receipt_footer"],
        "total": str(total),
        "tip_amount": str(order.tip_amount),
        "amount_received": str(received) if received is not None else None,
        "change": str(received - total) if received is not None and received >= total else None,
    }


class POSSaleView(APIView):
    """
    POST /api/pos/sales/
    body: {items: [{product, quantity}], payment_method, customer_name?, amount_received?}
    GET  /api/pos/sales/ -> historique des ventes du jour de ce caissier (pour reimprimer un ticket)
    """

    permission_classes = [IsCashier]

    def get(self, request):
        profile = request.user.cashier_profile
        orders = (
            Order.objects.filter(
                channel=Order.Channel.POS,
                cashier=request.user,
                status=Order.Status.PAID,
                created_at__date=timezone.localdate(),
            )
            .prefetch_related("items")
            .order_by("-created_at")
        )
        return Response([receipt_payload(o, profile) for o in orders])

    def post(self, request):
        profile = request.user.cashier_profile
        order, received = create_pos_sale(
            profile,
            request.data.get("items", []),
            request.data.get("payment_method"),
            request.data.get("customer_name", ""),
            request.data.get("amount_received"),
            str(request.data.get("table_label") or "").strip(),
            request.data.get("customer_phone", ""),
            request.data.get("tip_amount", 0),
        )
        return Response(receipt_payload(order, profile, received), status=201)


class POSClosingView(APIView):
    """
    Fermeture de caisse du caissier connecte, pour aujourd'hui.

    GET  /api/pos/closing/ -> etat du jour. Le comptage se fait "a l'aveugle" : tant que la caisse n'est
                              pas fermee, les montants attendus ne sont PAS communiques au caissier.
                              Une fois fermee, le caissier voit son ecart et peut corriger son comptage
                              (POST a nouveau) ; l'ecart initial et le nombre de corrections sont conserves.
    POST /api/pos/closing/ -> body {declared_cash, declared_wave, declared_orange_money, declared_card, notes}
    """

    permission_classes = [IsCashier]

    def _closing_today(self, profile):
        return DailyClosing.objects.filter(
            date=timezone.localdate(), point_of_sale=profile.point_of_sale, cashier=profile.user
        ).first()

    def get(self, request):
        profile = request.user.cashier_profile
        closing = self._closing_today(profile)
        totals, sales_count = cashier_sales_totals(profile, timezone.localdate())
        return Response(
            {
                "date": timezone.localdate(),
                "point_of_sale": profile.point_of_sale.name,
                "closed": closing is not None,
                "sales_count": sales_count,
                # le caissier voit l'attendu et son ecart des la fermeture (comptage en direct)
                "expected": {
                    "cash": totals["cash"],
                    "wave": totals["wave"],
                    "orange_money": totals["orange_money"],
                    "card": totals["card"],
                },
                "closing": DailyClosingSerializer(closing).data if closing else None,
            }
        )

    def post(self, request):
        profile = request.user.cashier_profile
        data = request.data
        closing, created = close_cashier_day(
            profile,
            {
                "cash": data.get("declared_cash"),
                "wave": data.get("declared_wave"),
                "orange_money": data.get("declared_orange_money"),
                "card": data.get("declared_card"),
            },
            data.get("notes", ""),
        )
        return Response(DailyClosingSerializer(closing).data, status=201 if created else 200)


def _order_state_label(o):
    """Etat lisible d'une commande du site : le paiement QR doit etre valide par le client puis verifie."""
    if o.status == Order.Status.PENDING and o.payment_method in ("wave", "orange_money"):
        return "Paiement declare - a verifier" if o.payment_declared_at else "En attente du paiement du client"
    return o.get_status_display()


class POSCustomerOrdersView(APIView):
    """GET /api/pos/customer-orders/ : commandes des clients (site web) rattachees a ce point de vente, 7 derniers jours."""

    permission_classes = [IsCashier]

    def get(self, request):
        store = request.user.cashier_profile.point_of_sale
        since = timezone.now() - timezone.timedelta(days=7)
        orders = (
            Order.objects.filter(channel=Order.Channel.ONLINE, point_of_sale=store, created_at__gte=since)
            .prefetch_related("items")
            .order_by("-created_at")
        )
        from apps.stores.loyalty import member_status

        def loyalty_of(o):
            """Fidelite du client de la commande (par telephone) : progression et recompenses a remettre."""
            info = member_status(store, o.customer_phone)
            if not info["enabled"] or not info["member"]:
                return None
            m = info["member"]
            return {
                "orders_count": m["orders_count"],
                "progress": m["progress"],
                "threshold": info["threshold"],
                "mode": info["mode"],
                "rewards": [{"id": r["id"], "label": r["label"]} for r in m["rewards"]],
            }

        return Response(
            [
                {
                    "reference": o.reference[:8].upper(),
                    "created_at": o.created_at,
                    "discount_amount": str(o.discount_amount),
                    "reward_label": o.reward_label,
                    "tip_amount": str(o.tip_amount),
                    "loyalty": loyalty_of(o),
                    "status": o.status,
                    "status_label": _order_state_label(o),
                    "payment_reference": o.payment_reference,
                    "ready_to_prepare": o.status == Order.Status.PAID or (o.status == Order.Status.PENDING and o.payment_method == "cash"),
                    "customer_name": o.customer_name,
                    "customer_phone": o.customer_phone,
                    "delivery_address": o.delivery_address,
                    "maps_url": o.location_maps_url,
                    "payment_method_label": METHOD_LABELS.get(o.payment_method, o.payment_method),
                    "total": str(o.total_amount),
                    "items": [{"name": i.product_name, "quantity": i.quantity} for i in o.items.all()],
                }
                for o in orders
            ]
        )


class POSDrawerView(APIView):
    """
    POST /api/pos/drawer/ {reason} : enregistre une ouverture du tiroir hors vente (controle).
    GET : ouvertures du jour. L'ouverture physique necessite un tiroir branche a l'imprimante de tickets.
    """

    permission_classes = [IsCashier]

    def get(self, request):
        store = request.user.cashier_profile.point_of_sale
        rows = DrawerOpening.objects.filter(point_of_sale=store, created_at__date=timezone.localdate())
        return Response(
            [{"id": r.id, "reason": r.reason, "cashier": r.cashier.username if r.cashier else None, "created_at": r.created_at} for r in rows]
        )

    def post(self, request):
        reason = str(request.data.get("reason") or "").strip()
        if not reason:
            from rest_framework.exceptions import ValidationError

            raise ValidationError({"reason": "Indiquez le motif de l'ouverture."})
        row = DrawerOpening.objects.create(
            point_of_sale=request.user.cashier_profile.point_of_sale, cashier=request.user, reason=reason[:200]
        )
        return Response({"id": row.id, "reason": row.reason, "created_at": row.created_at}, status=201)


class POSLoyaltyView(APIView):
    """
    GET  /api/pos/loyalty/?phone=... -> progression du client + recompenses disponibles (avec codes)
    POST /api/pos/loyalty/ {reward}  -> marque une recompense comme remise au client (utilisee)
    """

    permission_classes = [IsCashier]

    def get(self, request):
        from apps.stores.loyalty import member_status, normalize_phone
        from apps.stores.models import LoyaltyMember

        store = request.user.cashier_profile.point_of_sale
        q = (request.query_params.get("q") or "").strip()
        if q:  # suggestions : clients de ce point de vente dont le nom ou le telephone correspond
            digits = "".join(c for c in q if c.isdigit())
            cond = Q(name__icontains=q)
            if len(digits) >= 3:
                cond |= Q(phone__icontains=digits[-9:])
            found = LoyaltyMember.objects.filter(cond, point_of_sale=store).order_by("-updated_at")[:6]
            return Response(
                [
                    {
                        "name": m.name,
                        "phone": m.phone,
                        "orders_count": m.orders_count,
                        "rewards": len([r for r in m.rewards.filter(used_at__isnull=True)]),
                    }
                    for m in found
                ]
            )
        return Response(member_status(store, request.query_params.get("phone", "")))

    def post(self, request):
        from rest_framework.exceptions import ValidationError

        from apps.stores.models import LoyaltyReward

        store = request.user.cashier_profile.point_of_sale
        reward = LoyaltyReward.objects.filter(pk=request.data.get("reward") or 0, point_of_sale=store).first()
        if not reward:
            raise ValidationError({"detail": "Recompense introuvable."})
        if reward.used_at:
            raise ValidationError({"detail": "Recompense deja utilisee."})
        reward.used_at = timezone.now()
        reward.used_on_order = "en caisse"
        reward.save(update_fields=["used_at", "used_on_order"])
        return Response({"ok": True})


class POSDailyMenuView(APIView):
    """
    Menu du midi et speciaux du jour, geres par le caissier pour SON point de vente (aujourd'hui).
    GET  /api/pos/daily-menu/ -> {lunch: {...} | null, special: {...} | null}
    POST /api/pos/daily-menu/ {kind: lunch|special, items: [product_id, ...], is_published?, title?, note?}
         remplace la selection ; les numeros de choix suivent l'ordre de la liste ; les prix speciaux deja fixes par
         l'administrateur sont conserves (le caissier ne modifie pas les prix).
    """

    permission_classes = [IsCashier]

    @staticmethod
    def _payload(menu):
        if not menu:
            return None
        return {
            "kind": menu.kind,
            "title": menu.title,
            "note": menu.note,
            "is_published": menu.is_published,
            "items": [
                {
                    "product": i.product_id,
                    "name": i.product.name,
                    "number": i.number,
                    "price": str(i.product.price),
                    "special_price": str(i.special_price) if i.special_price is not None else None,
                }
                for i in menu.items.select_related("product")
            ],
        }

    def get(self, request):
        from apps.stores.models import DailyMenu

        store = request.user.cashier_profile.point_of_sale
        out = {"lunch": None, "special": None}
        for menu in DailyMenu.objects.filter(point_of_sale=store, date=timezone.localdate()):
            out[menu.kind] = self._payload(menu)
        return Response(out)

    def post(self, request):
        from rest_framework.exceptions import ValidationError

        from apps.stores.models import DailyMenu, DailyMenuItem

        store = request.user.cashier_profile.point_of_sale
        kind = request.data.get("kind")
        if kind not in ("lunch", "special"):
            raise ValidationError({"kind": "Type inconnu."})
        raw = request.data.get("items") or []
        if not isinstance(raw, list):
            raise ValidationError({"items": "Liste attendue."})
        ids = []
        for x in raw:
            try:
                pid = int(x)
            except (TypeError, ValueError):
                raise ValidationError({"items": "Produit invalide."})
            if pid not in ids:
                ids.append(pid)
        valid = set(Product.objects.filter(pk__in=ids, is_active=True, stocks__point_of_sale=store).values_list("pk", flat=True))
        if any(pid not in valid for pid in ids):
            raise ValidationError({"items": "Certains produits ne sont pas vendus dans ce point de vente."})
        today = timezone.localdate()
        menu, _ = DailyMenu.objects.get_or_create(point_of_sale=store, date=today, kind=kind)
        previous = {i.product_id: i.special_price for i in menu.items.all()}
        if "title" in request.data:
            menu.title = str(request.data.get("title") or "")[:80]
        if "note" in request.data:
            menu.note = str(request.data.get("note") or "")[:160]
        menu.is_published = bool(request.data.get("is_published", True))
        menu.save()
        menu.items.all().delete()
        DailyMenuItem.objects.bulk_create(
            [
                DailyMenuItem(menu=menu, product_id=pid, number=n, special_price=previous.get(pid) if kind == "special" else None)
                for n, pid in enumerate(ids, start=1)
            ]
        )
        return Response(self._payload(menu))
