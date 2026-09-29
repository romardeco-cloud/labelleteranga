from datetime import time as dt_time
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.catalog.models import Product
from apps.orders.models import Order, OrderItem
from apps.orders.services import parse_tip
from apps.reports.models import CashierOpening, DailyClosing
from apps.stores.models import Stock, StockMovement
from apps.stores.services import change_stock
from django.db.models.functions import TruncDate

POS_PAYMENT_METHODS = {m for m, _ in Order.PaymentMethod.choices}

# Avant cette heure, les ventes de la nuit sont encore rattachees a la journee commerciale de la veille (voir
# _grace_period_totals et _business_today) : le caissier peut fermer juste apres minuit sans que la fermeture
# ne deborde sur le jour calendaire qui vient de commencer.
GRACE_CUTOFF = dt_time(2, 30)


def _business_today():
    """
    'Aujourd'hui' pour une fermeture initiee par le caissier lui-meme, sans date explicite (voir
    POSClosingView.post). Avant GRACE_CUTOFF, on considere qu'on est encore dans la journee commerciale de
    la veille : sinon, fermer juste apres minuit (pour cloturer hier) fixerait `today` sur le nouveau jour
    calendaire et etendrait `covers_through` dessus, bloquant a tort toutes les ventes du reste de cette
    journee qui vient a peine de commencer.
    """
    now = timezone.localtime()
    return now.date() - timedelta(days=1) if now.time() < GRACE_CUTOFF else now.date()


@transaction.atomic
def create_pos_sale(cashier_profile, items, payment_method, customer_name="", amount_received=None, table_label="", customer_phone="", tip_amount=0):
    """
    Enregistre une vente en caisse : commande deja payee, rattachee au point de
    vente du caissier, et decremente le stock de CE point de vente. Tout ou rien :
    si un produit manque de stock, aucune vente n'est enregistree.
    """
    if payment_method not in POS_PAYMENT_METHODS:
        raise ValidationError({"payment_method": "Moyen de paiement invalide."})
    from apps.stores.models import get_settings  # import tardif (evite un cycle d'apps)

    if payment_method not in get_settings(cashier_profile.point_of_sale).payment_methods:
        raise ValidationError({"payment_method": "Ce moyen de paiement n'est pas active pour ce point de vente."})
    if not items:
        raise ValidationError({"items": "Le panier est vide."})

    store = cashier_profile.point_of_sale
    today = timezone.localdate()
    closing_today = DailyClosing.covering(date=today, point_of_sale=store, cashier=cashier_profile.user)
    if closing_today and closing_today.blocks(today):
        raise ValidationError({"detail": "Votre caisse est fermee pour aujourd'hui."})
    if not CashierOpening.objects.filter(date=timezone.localdate(), point_of_sale=store, cashier=cashier_profile.user).exists():
        raise ValidationError({"detail": "Ouvrez votre caisse (fond de caisse) avant de commencer a vendre."})

    order = Order.objects.create(
        channel=Order.Channel.POS,
        cashier=cashier_profile.user,
        point_of_sale=store,
        customer_name=customer_name or (f"Table {table_label}" if table_label else "Client comptoir"),
        service_mode=Order.ServiceMode.DINE_IN if table_label else Order.ServiceMode.DIRECT,
        table_label=table_label[:40],
        customer_email="",
        customer_phone=str(customer_phone or "")[:30],
        tip_amount=parse_tip(tip_amount),
        payment_method=payment_method,
        status=Order.Status.PAID,
        paid_at=timezone.now(),
    )

    from apps.stores.models import tracks_stock  # import tardif (evite un cycle d'apps)

    from apps.stores.services import price_for, special_prices_map

    specials = special_prices_map(store)
    tracked = tracks_stock(store)
    merged = {}
    for line in items:
        pid = int(line["product"])
        qty = int(line["quantity"])
        if qty <= 0:
            raise ValidationError({"items": "Quantite invalide."})
        merged[pid] = merged.get(pid, 0) + qty

    for product_id, qty in merged.items():
        product = Product.objects.filter(pk=product_id, is_active=True).first()
        if not product:
            raise ValidationError({"items": f"Produit {product_id} introuvable ou inactif."})

        product_tracked = tracked and tracks_stock(store, product)
        if product_tracked:
            stock = Stock.objects.select_for_update().filter(product=product, point_of_sale=store).first()
            available = stock.quantity if stock else 0
            if available < qty:
                raise ValidationError({"items": f"Stock insuffisant pour '{product.name}' (disponible: {available})."})

        unit_price, _label = price_for(product, store, specials)

        OrderItem.objects.create(
            order=order,
            product=product,
            product_name=product.name,
            unit_price=unit_price,
            quantity=qty,
        )
        if product_tracked:
            change_stock(
                product,
                store,
                delta=-qty,
                reason=StockMovement.Reason.SALE_POS,
                reference=order.reference[:8].upper(),
                user=cashier_profile.user,
            )

    order.recompute_total()
    order.save(update_fields=["total_amount"])

    if order.customer_phone:
        from apps.stores.loyalty import record_paid_order

        record_paid_order(order)

    received = Decimal(str(amount_received)) if amount_received not in (None, "") else None
    if received is not None and received < order.total_amount and payment_method == Order.PaymentMethod.CASH:
        raise ValidationError({"amount_received": "Montant recu inferieur au total."})

    return order, received


def _closing_covered_order_ids(cashier_profile, ignore_closing_date=None):
    """
    Toutes les commandes de ce caissier deja couvertes par une fermeture existante (normale ou automatique) :
    son intervalle [date, covers_through] complet, PLUS les ventes du lendemain avant GRACE_CUTOFF (meme regle
    que la fermeture automatique - voir auto_close_overdue_cashiers/_grace_period_totals). Sans cette exclusion,
    une vente faite juste apres minuit (deja incluse dans la fermeture de la veille grace a cette periode de
    grace) reapparaitrait EN PLUS comme une vente "nouvelle" et non fermee du jour meme, et serait comptee deux
    fois (voir _unclosed_prior_dates et _sales_totals_range, qui excluent toutes deux ce jeu d'identifiants).

    `ignore_closing_date` : a passer par _sales_totals_range quand la fermeture EN COURS DE CALCUL (creation ou
    correction) est elle-meme datee de `start_date` - sinon une fermeture existante s'excluerait ses propres
    commandes en se recalculant (voir close_cashier_day, qui recalcule une fermeture deja creee pour la
    corriger apres que le caissier a vu son ecart).

    Compte aussi les fermetures GLOBALES du point de vente (cashier vide : cloture faite par l'admin sans
    caissier precis) - elles couvrent bien les ventes de ce caissier, sinon celui-ci les verrait reapparaitre
    comme non fermees (voir _unclosed_prior_dates, qui utilise le meme filtre).
    """
    from django.db.models import Q

    store = cashier_profile.point_of_sale
    ids = set()
    for c in DailyClosing.objects.filter(point_of_sale=store).filter(Q(cashier=cashier_profile.user) | Q(cashier__isnull=True)):
        if ignore_closing_date is not None and c.date == ignore_closing_date:
            continue
        c_end = c.covers_through or c.date
        grace_day = c_end + timedelta(days=1)
        qs = Order.objects.filter(
            status=Order.Status.PAID,
            channel=Order.Channel.POS,
            cashier=cashier_profile.user,
            point_of_sale=store,
        ).filter(Q(paid_at__date__gte=c.date, paid_at__date__lte=c_end) | Q(paid_at__date=grace_day, paid_at__time__lt=GRACE_CUTOFF))
        ids.update(qs.values_list("id", flat=True))
    return ids


def _unclosed_prior_dates(cashier_profile, before_date):
    """Jours strictement avant `before_date` ou ce caissier a vendu, sans fermeture enregistree (argent jamais retire du tiroir).
    Un jour est considere ferme s'il a sa propre fermeture, OU s'il tombe dans l'intervalle [date, covers_through]
    d'une fermeture qui regroupe plusieurs jours (le caissier a ferme plus tard, apres minuit ou apres un oubli,
    mais la fermeture reste datee du premier jour concerne). Une fermeture GLOBALE du point de vente (cashier
    vide) compte aussi comme fermeture de ce caissier (voir _closing_covered_order_ids)."""
    from django.db.models import Q

    store = cashier_profile.point_of_sale
    covered_ids = _closing_covered_order_ids(cashier_profile)
    dates = (
        Order.objects.filter(
            status=Order.Status.PAID,
            channel=Order.Channel.POS,
            cashier=cashier_profile.user,
            point_of_sale=store,
            paid_at__date__lt=before_date,
        )
        .exclude(pk__in=covered_ids)
        .annotate(d=TruncDate("paid_at"))
        .order_by()  # sans ceci, le tri par defaut du modele (-created_at) empeche le DISTINCT de dedoublonner les dates
        .values_list("d", flat=True)
        .distinct()
    )
    dates = list(dates)
    if not dates:
        return []
    own_or_global = Q(cashier=cashier_profile.user) | Q(cashier__isnull=True)
    closed = set(
        DailyClosing.objects.filter(point_of_sale=store, date__in=dates).filter(own_or_global).values_list("date", flat=True)
    )
    ranges = list(
        DailyClosing.objects.filter(point_of_sale=store, covers_through__isnull=False, date__lt=before_date)
        .filter(own_or_global)
        .values_list("date", "covers_through")
    )
    return sorted(d for d in dates if d not in closed and not any(start <= d <= end for start, end in ranges))


def _sales_totals_range(cashier_profile, start_date, end_date):
    """
    Ventes (+ pourboires) de ce caissier additionnees sur TOUT l'intervalle [start_date, end_date] inclus.
    Utilise pour une fermeture qui regroupe plusieurs jours non fermes (le caissier a ferme plus tard, apres
    minuit ou apres un oubli) : le calendrier peut avancer sans faire changer la date de la fermeture tant
    qu'elle n'a pas reellement eu lieu.

    NB : le fond de caisse (CashierOpening) n'est PAS ajoute ici - "cash" ne represente que les ventes en
    especes. Le fond de caisse reste un montant a part, jamais mele au chiffre d'affaires ni au montant de
    la fermeture (voir opening_cash_for) ; c'est au frontend de le faire recompter separement s'il le souhaite.
    """
    from django.db.models import Count, Sum

    totals = {key: Decimal("0") for key, _ in Order.PaymentMethod.choices}
    covered_ids = _closing_covered_order_ids(cashier_profile, ignore_closing_date=start_date)
    qs = Order.objects.filter(
        status=Order.Status.PAID,
        channel=Order.Channel.POS,
        cashier=cashier_profile.user,
        point_of_sale=cashier_profile.point_of_sale,
        paid_at__date__gte=start_date,
        paid_at__date__lte=end_date,
    ).exclude(pk__in=covered_ids)
    for row in qs.values("payment_method").annotate(total=Sum("total_amount")):
        totals[row["payment_method"]] = row["total"] or Decimal("0")
    tips = qs.aggregate(t=Sum("tip_amount"))["t"] or Decimal("0")
    return totals, tips, qs.aggregate(n=Count("id"))["n"]


def closing_date_for(cashier_profile, for_date):
    """
    Date a utiliser pour la fermeture de (caissier, for_date) : celle d'une fermeture EXISTANTE qui couvre
    deja for_date (a mettre a jour, meme si for_date a ete cloture plus tot le meme jour), sinon le premier
    jour non ferme, sinon for_date lui-meme. Utilisee a la fois par l'apercu (cashier-preview) et par la
    fermeture reelle (close_cashier_day) pour qu'ils restent toujours coherents entre eux.
    """
    existing = DailyClosing.covering(date=for_date, point_of_sale=cashier_profile.point_of_sale, cashier=cashier_profile.user)
    if existing:
        return existing.date
    prior_dates = _unclosed_prior_dates(cashier_profile, for_date)
    return prior_dates[0] if prior_dates else for_date




def opening_cash_for(cashier_profile, for_date):
    """Fond de caisse (especes) ouvert ce jour-la par ce caissier, ou None si sa caisse n'a pas ete ouverte."""
    opening = CashierOpening.objects.filter(date=for_date, point_of_sale=cashier_profile.point_of_sale, cashier=cashier_profile.user).first()
    return opening.opening_cash if opening else None


@transaction.atomic
def open_cashier_day(cashier_profile, opening_cash, notes="", for_date=None, opened_by=None):
    """
    Ouverture de caisse : fond de caisse (especes) saisi manuellement avant de commencer les ventes du jour.
    Une seule ouverture par jour et par caissier (voir CashierOpening.Meta.unique_together) ; l'administrateur
    peut la corriger via cette meme fonction (create_or_update). Retourne (ouverture, creee).
    """
    today = for_date or timezone.localdate()
    if opening_cash in (None, ""):
        raise ValidationError({"opening_cash": "Le fond de caisse est obligatoire avant d'ouvrir la caisse."})
    try:
        amount = Decimal(str(opening_cash))
    except Exception:
        raise ValidationError({"opening_cash": "Montant invalide."})
    if amount < 0:
        raise ValidationError({"opening_cash": "Le fond de caisse ne peut pas etre negatif."})

    opening, created = CashierOpening.objects.get_or_create(
        date=today,
        point_of_sale=cashier_profile.point_of_sale,
        cashier=cashier_profile.user,
        defaults={"opening_cash": amount, "notes": (notes or "")[:200], "opened_by": opened_by or cashier_profile.user},
    )
    if not created:
        opening.opening_cash = amount
        opening.notes = (notes or "")[:200]
        opening.opened_by = opened_by or opening.opened_by
        opening.save(update_fields=["opening_cash", "notes", "opened_by", "updated_at"])
    return opening, created


@transaction.atomic
def close_cashier_day(cashier_profile, declared, notes="", for_date=None, closed_by=None):
    """
    Fermeture de caisse du caissier. Un premier appel cree la fermeture (comptage a l'aveugle) ;
    les appels suivants, le meme jour, corrigent le comptage apres que le caissier a vu son ecart.
    L'ecart initial et le nombre de corrections restent enregistres pour l'administrateur.

    La date de la fermeture ne change qu'a la fermeture elle-meme, jamais toute seule a minuit : si le caissier
    n'avait pas ferme un ou plusieurs jours precedents, tout l'argent accumule est regroupe dans UNE SEULE
    fermeture, datee du PREMIER jour non ferme (covers_through indique jusqu'ou elle va) - jamais une fermeture
    "a l'equilibre" separee pour chaque jour oublie. Retourne (fermeture, creee).
    """
    # sans date explicite (fermeture depuis la caisse elle-meme), on utilise la journee commerciale en cours
    # (voir _business_today) plutot que la date calendaire brute, pour ne jamais faire deborder covers_through
    # sur un jour qui vient a peine de commencer si le caissier ferme juste apres minuit.
    today = for_date or _business_today()
    store = cashier_profile.point_of_sale

    # meme calcul que l'apercu (cashier-preview), pour que la fermeture reelle corresponde toujours a ce que
    # l'apercu vient de montrer : la date de depart peut etre celle d'une fermeture DEJA existante qui couvre
    # aujourd'hui (correction), sinon le premier jour non ferme.
    closing_date = closing_date_for(cashier_profile, today)
    covers_through = today if closing_date != today else None
    totals, tips_total, _n = _sales_totals_range(cashier_profile, closing_date, today)

    def amount(key):
        try:
            value = Decimal(str(declared.get(key, 0) or 0))
        except Exception:
            raise ValidationError({key: "Montant invalide."})
        if value < 0:
            raise ValidationError({key: "Montant invalide."})
        return value

    values = {
        "declared_card": amount("card"),
        "declared_wave": amount("wave"),
        "declared_orange_money": amount("orange_money"),
        "declared_cash": amount("cash"),
    }
    expected = {
        "expected_card": totals["card"],
        "expected_wave": totals["wave"],
        "expected_orange_money": totals["orange_money"],
        "expected_cash": totals["cash"],
    }
    notes = (notes or "")[:1000]

    closing = DailyClosing.objects.select_for_update().filter(date=closing_date, point_of_sale=store, cashier=cashier_profile.user).first()

    if covers_through and not notes and not (closing.notes if closing else ""):
        notes = f"Fermeture regroupee : couvre du {closing_date.strftime('%d/%m/%Y')} au {covers_through.strftime('%d/%m/%Y')} (caisse non fermee avant)."

    # un ecart de caisse (compte different de l'attendu) doit toujours etre explique
    declared_total = sum(values.values())
    expected_total = sum(expected.values())
    final_notes = notes or (closing.notes if closing else "")
    if declared_total != expected_total and not final_notes:
        raise ValidationError({"notes": "Il y a un ecart de caisse : expliquez la raison dans la remarque avant de fermer."})

    if closing is None:
        closing = DailyClosing(
            date=closing_date,
            point_of_sale=store,
            cashier=cashier_profile.user,
            closed_by=closed_by or cashier_profile.user,
            notes=notes,
            covers_through=covers_through,
            tips_total=tips_total,
            **values,
            **expected,
        )
        closing.initial_discrepancy_total = closing.discrepancy_total
        closing.save()
        return closing, True

    for field, value in {**values, **expected}.items():
        setattr(closing, field, value)
    closing.tips_total = tips_total
    if covers_through:
        closing.covers_through = covers_through
    if notes:
        closing.notes = notes
    closing.revision_count += 1
    closing.save()
    return closing, False


def _grace_period_totals(cashier_profile, start_date, today, grace_cutoff=None):
    """
    Comme _sales_totals_range(start_date, today), mais pour aujourd'hui (`today`) ne compte QUE les ventes
    faites avant `grace_cutoff` (2h30 par defaut) : les quelques ventes faites juste apres minuit, avant que
    le caissier ait pu fermer, restent rattachees a la journee non fermee (start_date) sans pour autant
    fermer le reste d'aujourd'hui (une fermeture normale, elle, doit pouvoir avoir lieu plus tard le meme jour).
    Utilisee uniquement par la fermeture automatique.
    """
    from django.db.models import Count, Q, Sum

    grace_cutoff = grace_cutoff or GRACE_CUTOFF
    totals = {key: Decimal("0") for key, _ in Order.PaymentMethod.choices}
    qs = Order.objects.filter(
        status=Order.Status.PAID,
        channel=Order.Channel.POS,
        cashier=cashier_profile.user,
        point_of_sale=cashier_profile.point_of_sale,
    ).filter(Q(paid_at__date__gte=start_date, paid_at__date__lt=today) | Q(paid_at__date=today, paid_at__time__lt=grace_cutoff))
    for row in qs.values("payment_method").annotate(total=Sum("total_amount")):
        totals[row["payment_method"]] = row["total"] or Decimal("0")
    # NB : pas de fond de caisse ajoute ici non plus (voir _sales_totals_range) - "cash" reste uniquement les
    # ventes en especes.
    tips = qs.aggregate(t=Sum("tip_amount"))["t"] or Decimal("0")
    return totals, tips, qs.aggregate(n=Count("id"))["n"]


def auto_close_overdue_cashiers(only_profile=None, store=None):
    """
    Ferme automatiquement, a l'equilibre (sans ecart, personne n'a compte), la caisse de chaque caissier
    qui ne l'a pas fermee la veille avant 2h30 du matin (ou un jour plus ancien, toujours en retard). Appelee
    a chaque usage de la caisse/de l'admin (voir apps.pos.views et apps.reports.views) et, si configuree,
    par un appel programme externe (voir AUTO_CLOSE_SECRET). Retourne le nombre de journees fermees.

    Une seule fermeture regroupee par caissier (comme close_cashier_day), jamais une par jour oublie : les
    ventes faites juste apres minuit (avant 2h30, avant que le caissier ait pu fermer) sont incluses dans le
    total via _grace_period_totals, mais covers_through ne va jamais jusqu'a aujourd'hui, pour ne pas bloquer
    les ventes normales du reste de la journee.
    """
    from datetime import timedelta

    from apps.accounts.models import CashierProfile

    now = timezone.localtime()
    today = now.date()
    yesterday = today - timedelta(days=1)
    yesterday_ready = now.time() >= dt_time(2, 30)  # avant 2h30, on laisse encore la chance au caissier de fermer hier lui-meme

    profiles = CashierProfile.objects.filter(is_active=True).select_related("user", "point_of_sale")
    if only_profile is not None:
        profiles = profiles.filter(pk=only_profile.pk)
    if store is not None:
        profiles = profiles.filter(point_of_sale_id=store)

    closed = 0
    for profile in profiles:
        if not profile.point_of_sale_id:
            continue
        overdue = _unclosed_prior_dates(profile, today)
        if not overdue:
            continue
        most_recent = max(overdue)
        if most_recent == yesterday and not yesterday_ready:
            continue
        closing_date = min(overdue)
        totals, tips_total, _n = _grace_period_totals(profile, closing_date, today)
        DailyClosing.objects.create(
            date=closing_date,
            point_of_sale=profile.point_of_sale,
            cashier=profile.user,
            closed_by=None,
            notes="Fermeture automatique : caisse non fermee par le caissier avant 2h30 du matin.",
            covers_through=most_recent if most_recent != closing_date else None,
            expected_card=totals["card"], expected_wave=totals["wave"], expected_orange_money=totals["orange_money"], expected_cash=totals["cash"],
            declared_card=totals["card"], declared_wave=totals["wave"], declared_orange_money=totals["orange_money"], declared_cash=totals["cash"],
            tips_total=tips_total,
            auto_closed=True,
        )
        closed += 1
    return closed
