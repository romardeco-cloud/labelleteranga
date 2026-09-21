"""Avis clients, fidelisation et combos evenementiels (public + administration)."""

from datetime import timedelta

from django.db.models import Avg, Count, Q
from django.utils import timezone
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from apps.orders.models import Order

from .loyalty import member_status, normalize_phone
from .models import Combo, ComboRequest, LoyaltyMember, LoyaltyReward, PointOfSale, Review


class SubmitThrottle(AnonRateThrottle):
    rate = "20/hour"


def _site_store(slug):
    try:
        return PointOfSale.objects.get(slug=slug, online_enabled=True, is_active=True)
    except PointOfSale.DoesNotExist:
        raise ValidationError({"detail": "Site introuvable."})


def _rating(data, key, required=True):
    raw = data.get(key)
    if raw in (None, ""):
        if required:
            raise ValidationError({key: "Note obligatoire (1 a 5)."})
        return None
    try:
        value = int(raw)
    except (TypeError, ValueError):
        raise ValidationError({key: "Note invalide."})
    if not 1 <= value <= 5:
        raise ValidationError({key: "La note doit etre comprise entre 1 et 5."})
    return value


# ------------------------------------------------------------------ avis


def review_summary(qs):
    agg = qs.aggregate(
        n=Count("id"),
        service=Avg("service_rating"),
        quality=Avg("quality_rating"),
        speed=Avg("q_speed"),
        welcome=Avg("q_welcome"),
    )
    n = agg["n"] or 0
    distribution = {str(i): 0 for i in range(1, 6)}
    recommend = {"yes": 0, "maybe": 0, "no": 0}
    for service, quality, rec in qs.values_list("service_rating", "quality_rating", "q_recommend"):
        distribution[str(round((service + quality) / 2 + 0.0001))] += 1
        if rec in recommend:
            recommend[rec] += 1
    r1 = lambda v: round(float(v), 1) if v is not None else None
    overall = ((agg["service"] or 0) + (agg["quality"] or 0)) / 2 if n else None
    return {
        "count": n,
        "service": r1(agg["service"]),
        "quality": r1(agg["quality"]),
        "overall": r1(overall),
        "speed": r1(agg["speed"]),
        "welcome": r1(agg["welcome"]),
        "distribution": distribution,
        "recommend": recommend,
    }


def _public_review(r):
    first = (r.customer_name or "").split(" ")[0] or "Client"
    return {
        "id": r.id,
        "name": first,
        "service_rating": r.service_rating,
        "quality_rating": r.quality_rating,
        "dish": r.dish,
        "comment": r.comment,
        "reply": r.reply,
        "created_at": r.created_at,
    }


class SiteReviewsView(APIView):
    """
    GET  /api/stores/sites/<slug>/reviews/            -> {summary, reviews: [...]} (avis publies)
    POST /api/stores/sites/<slug>/reviews/            -> {service_rating, quality_rating, q_speed, q_welcome, q_recommend,
                                                          comment, dish, customer_name, order?}
    """

    permission_classes = [permissions.AllowAny]

    def get_throttles(self):
        return [SubmitThrottle()] if self.request.method == "POST" else []

    def get(self, request, slug):
        store = _site_store(slug)
        qs = Review.objects.filter(point_of_sale=store, is_published=True)
        shown = qs.exclude(comment="").filter(comment_hidden=False)[:30]
        return Response({"summary": review_summary(qs), "reviews": [_public_review(r) for r in shown]})

    def post(self, request, slug):
        store = _site_store(slug)
        d = request.data
        service = _rating(d, "service_rating")
        quality = _rating(d, "quality_rating")
        speed = _rating(d, "q_speed", required=False)
        welcome = _rating(d, "q_welcome", required=False)
        recommend = str(d.get("q_recommend") or "")
        if recommend not in ("", "yes", "maybe", "no"):
            raise ValidationError({"q_recommend": "Reponse invalide."})
        comment = str(d.get("comment") or "").strip()[:1000]
        reference = str(d.get("order") or "").strip()
        order = None
        if reference:
            order = Order.objects.filter(reference=reference, point_of_sale=store).first()
            if not order:
                raise ValidationError({"order": "Commande introuvable."})
            if Review.objects.filter(point_of_sale=store, order_reference=order.reference).exists():
                raise ValidationError({"detail": "Vous avez deja donne votre avis sur cette commande. Merci !"})
        review = Review.objects.create(
            point_of_sale=store,
            order_reference=order.reference if order else "",
            customer_name=(str(d.get("customer_name") or "") or (order.customer_name if order else ""))[:100],
            customer_phone=(order.customer_phone if order else "")[:30],
            service_rating=service,
            quality_rating=quality,
            q_speed=speed,
            q_welcome=welcome,
            q_recommend=recommend,
            dish=str(d.get("dish") or "")[:150],
            comment=comment,
        )
        return Response(_public_review(review), status=status.HTTP_201_CREATED)


class ReviewAdminSerializer(serializers.ModelSerializer):
    point_of_sale_name = serializers.CharField(source="point_of_sale.name", read_only=True)

    class Meta:
        model = Review
        fields = [
            "id", "point_of_sale", "point_of_sale_name", "order_reference", "customer_name", "customer_phone", "service_rating",
            "quality_rating", "q_speed", "q_welcome", "q_recommend", "dish", "comment", "is_published", "comment_hidden", "reply", "created_at",
        ]
        read_only_fields = [f for f in fields if f not in ("is_published", "comment_hidden", "reply")]


class ReviewAdminViewSet(viewsets.ModelViewSet):
    """GET /api/stores/reviews/?point_of_sale=<id>&rating=<1-5> -> {summary, results} ; PATCH {is_published, comment_hidden, reply} ; DELETE."""

    permission_classes = [permissions.IsAdminUser]
    serializer_class = ReviewAdminSerializer
    pagination_class = None
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_queryset(self):
        qs = Review.objects.select_related("point_of_sale")
        store = self.request.query_params.get("point_of_sale")
        if store:
            qs = qs.filter(point_of_sale_id=store)
        return qs

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()
        summary = review_summary(qs)
        rating = request.query_params.get("rating")
        if rating and rating.isdigit():
            qs = qs.filter(Q(service_rating=int(rating)) | Q(quality_rating=int(rating)))
        return Response({"summary": summary, "results": self.get_serializer(qs[:300], many=True).data})


# ------------------------------------------------------------------ fidelite


class SiteLoyaltyView(APIView):
    """GET /api/stores/sites/<slug>/loyalty/?phone=... -> programme + progression du client (sans les codes)."""

    permission_classes = [permissions.AllowAny]

    def get(self, request, slug):
        store = _site_store(slug)
        data = member_status(store, request.query_params.get("phone", ""))
        if data["member"]:
            for r in data["member"]["rewards"]:
                r.pop("code", None)
        return Response(data)


class LoyaltyAdminView(APIView):
    """
    GET  /api/stores/loyalty/?point_of_sale=<id>&q=<tel|nom> -> {members: [...], stats}
    POST /api/stores/loyalty/ {reward: <id>} -> marque la recompense comme utilisee (remise en main propre, en caisse)
    """

    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        qs = LoyaltyMember.objects.select_related("point_of_sale")
        store = request.query_params.get("point_of_sale")
        if store:
            qs = qs.filter(point_of_sale_id=store)
        q = (request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(Q(phone__icontains=normalize_phone(q) or q) | Q(name__icontains=q))
        now = timezone.now()
        members = []
        for m in qs.prefetch_related("rewards").order_by("-total_spent")[:300]:
            rewards = [r for r in m.rewards.all() if not r.used_at and (not r.expires_at or r.expires_at > now)]
            members.append(
                {
                    "id": m.id,
                    "point_of_sale": m.point_of_sale_id,
                    "point_of_sale_name": m.point_of_sale.name,
                    "phone": m.phone,
                    "name": m.name,
                    "orders_count": m.orders_count,
                    "total_spent": m.total_spent,
                    "progress": m.progress,
                    "rewards_earned": m.rewards_earned,
                    "rewards": [
                        {"id": r.id, "code": r.code, "label": r.label, "expires_at": r.expires_at} for r in rewards
                    ],
                }
            )
        base = LoyaltyMember.objects.filter(point_of_sale_id=store) if store else LoyaltyMember.objects.all()
        rewards_qs = LoyaltyReward.objects.filter(point_of_sale_id=store) if store else LoyaltyReward.objects.all()
        stats = {
            "members": base.count(),
            "rewards_issued": rewards_qs.count(),
            "rewards_used": rewards_qs.filter(used_at__isnull=False).count(),
            "rewards_pending": rewards_qs.filter(used_at__isnull=True).filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now)).count(),
        }
        return Response({"members": members, "stats": stats})

    def post(self, request):
        try:
            reward = LoyaltyReward.objects.get(pk=request.data.get("reward"))
        except (LoyaltyReward.DoesNotExist, ValueError, TypeError):
            raise ValidationError({"detail": "Recompense introuvable."})
        if reward.used_at:
            raise ValidationError({"detail": "Recompense deja utilisee."})
        reward.used_at = timezone.now()
        reward.used_on_order = "en caisse"
        reward.save(update_fields=["used_at", "used_on_order"])
        return Response({"ok": True})


# ------------------------------------------------------------------ combos evenementiels


class ComboSerializer(serializers.ModelSerializer):
    image = serializers.ImageField(required=False, allow_null=True)

    class Meta:
        model = Combo
        fields = [
            "id", "point_of_sale", "name", "occasion", "description", "includes", "serves", "price", "image", "weekend_only",
            "starts_on", "ends_on", "min_notice_hours", "is_active", "order",
        ]


def _combo_available(combo, today):
    return combo.is_active and (not combo.starts_on or combo.starts_on <= today) and (not combo.ends_on or combo.ends_on >= today)


class SiteCombosView(APIView):
    """GET /api/stores/sites/<slug>/combos/ -> combos actifs (public)."""

    permission_classes = [permissions.AllowAny]

    def get(self, request, slug):
        store = _site_store(slug)
        today = timezone.localdate()
        combos = [c for c in Combo.objects.filter(point_of_sale=store, is_active=True) if _combo_available(c, today)]
        return Response(ComboSerializer(combos, many=True, context={"request": request}).data)


class SiteComboRequestView(APIView):
    """POST /api/stores/sites/<slug>/combo-requests/ {combo, customer_name, customer_phone, event_date, guests, message}"""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [SubmitThrottle]

    def post(self, request, slug):
        from datetime import date as date_cls

        store = _site_store(slug)
        d = request.data
        combo = Combo.objects.filter(pk=d.get("combo") or 0, point_of_sale=store).first()
        today = timezone.localdate()
        if not combo or not _combo_available(combo, today):
            raise ValidationError({"combo": "Ce combo n'est plus disponible."})
        name = str(d.get("customer_name") or "").strip()
        if not name:
            raise ValidationError({"customer_name": "Indiquez votre nom."})
        phone = str(d.get("customer_phone") or "").strip()
        if not normalize_phone(phone):
            raise ValidationError({"customer_phone": "Numero de telephone invalide."})
        try:
            event_date = date_cls.fromisoformat(str(d.get("event_date")))
        except ValueError:
            raise ValidationError({"event_date": "Date invalide."})
        earliest = (timezone.now() + timedelta(hours=combo.min_notice_hours)).date()
        if event_date < earliest:
            raise ValidationError({"event_date": f"Reservation au moins {combo.min_notice_hours} h a l'avance (a partir du {earliest:%d/%m/%Y})."})
        if combo.weekend_only and event_date.weekday() < 5:
            raise ValidationError({"event_date": "Ce combo est disponible uniquement le week-end (samedi ou dimanche)."})
        if combo.starts_on and event_date < combo.starts_on or combo.ends_on and event_date > combo.ends_on:
            raise ValidationError({"event_date": "Ce combo n'est pas disponible a cette date."})
        try:
            guests = max(1, min(int(d.get("guests") or 1), 500))
        except (TypeError, ValueError):
            raise ValidationError({"guests": "Nombre de personnes invalide."})
        req = ComboRequest.objects.create(
            point_of_sale=store,
            combo=combo,
            combo_name=combo.name,
            combo_price=combo.price,
            customer_name=name[:100],
            customer_phone=phone[:30],
            event_date=event_date,
            guests=guests,
            message=str(d.get("message") or "")[:600],
        )
        return Response({"id": req.id, "detail": "Demande envoyee ! Nous vous contactons rapidement pour confirmer."}, status=201)


def _norm_name(text):
    import re
    import unicodedata

    return re.sub(r"[^a-z0-9]+", "", unicodedata.normalize("NFKD", str(text or "")).encode("ascii", "ignore").decode().lower())


def sync_combo_prices(store, activate=False, only=None):
    """
    Applique le prix des combos (Admin > Combos) au produit du meme nom (accents et majuscules ignores) du point de vente :
    c'est ce prix qu'affichent le menu du site et la caisse. Un produit vendu aussi par un autre point de vente n'est pas modifie.
    """
    from apps.catalog.models import Product

    from .models import Stock

    product_ids = set(Stock.objects.filter(point_of_sale=store).values_list("product_id", flat=True))
    shared = set(Stock.objects.filter(product_id__in=product_ids).exclude(point_of_sale=store).values_list("product_id", flat=True))
    products = {}
    for p in Product.objects.filter(pk__in=product_ids):
        products.setdefault(_norm_name(p.name), p)
    out = {"updated": [], "unchanged": [], "no_price": [], "no_product": [], "shared": []}
    combos = Combo.objects.filter(point_of_sale=store).order_by("order", "id")
    if only is not None:
        combos = combos.filter(pk=only.pk)
    for combo in combos:
        if combo.price <= 0:
            out["no_price"].append(combo.name)
            continue
        product = products.get(_norm_name(combo.name))
        if product is None:
            out["no_product"].append(combo.name)
        elif product.pk in shared:
            out["shared"].append(combo.name)
        elif product.price == combo.price and not (activate and not product.is_active):
            out["unchanged"].append(combo.name)
        else:
            row = {"combo": combo.name, "product": product.name, "old_price": int(product.price), "new_price": int(combo.price)}
            product.price = combo.price
            fields = ["price"]
            if activate and not product.is_active:
                product.is_active = True
                fields.append("is_active")
                row["activated"] = True
            product.save(update_fields=fields)
            out["updated"].append(row)
    return out


class ComboAdminViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAdminUser]
    serializer_class = ComboSerializer
    pagination_class = None
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        qs = Combo.objects.all()
        store = self.request.query_params.get("point_of_sale")
        return qs.filter(point_of_sale_id=store) if store else qs

    def _clear_image(self, request, instance):
        if str(request.data.get("remove_image", "")).lower() in ("1", "true") and instance.image:
            instance.image.delete(save=False)
            instance.image = ""
            instance.save(update_fields=["image"])

    def perform_create(self, serializer):
        instance = serializer.save()
        sync_combo_prices(instance.point_of_sale, only=instance)  # le produit du meme nom prend le prix du combo

    def perform_update(self, serializer):
        instance = serializer.save()
        self._clear_image(self.request, instance)
        sync_combo_prices(instance.point_of_sale, only=instance)

    @action(detail=False, methods=["post"], url_path="sync-prices")
    def sync_prices(self, request):
        """POST {point_of_sale, activate?} : applique le prix de chaque combo au produit du meme nom dans ce point de vente."""
        store = PointOfSale.objects.filter(pk=request.data.get("point_of_sale") or 0).first()
        if not store:
            raise ValidationError({"point_of_sale": "Choisissez un point de vente."})
        activate = str(request.data.get("activate", "")).lower() in ("1", "true", "yes", "on")
        return Response(sync_combo_prices(store, activate=activate))


class ComboRequestSerializer(serializers.ModelSerializer):
    point_of_sale_name = serializers.CharField(source="point_of_sale.name", read_only=True)

    class Meta:
        model = ComboRequest
        fields = [
            "id", "point_of_sale", "point_of_sale_name", "combo_name", "combo_price", "customer_name", "customer_phone",
            "event_date", "guests", "message", "status", "created_at",
        ]
        read_only_fields = [f for f in fields if f != "status"]


class ComboRequestAdminViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAdminUser]
    serializer_class = ComboRequestSerializer
    pagination_class = None
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_queryset(self):
        qs = ComboRequest.objects.select_related("point_of_sale")
        store = self.request.query_params.get("point_of_sale")
        return qs.filter(point_of_sale_id=store) if store else qs


# ------------------------------------------------------------------ cachet et signature


def _data_url(blob):
    import base64

    return "data:image/png;base64," + base64.b64encode(bytes(blob)).decode() if blob else None


def seal_payload(seal):
    return {
        "enabled": seal.enabled,
        "stamp": _data_url(seal.stamp_png),
        "signature": _data_url(seal.signature_png),
        "stamp_color": seal.stamp_color,
        "signer_name": seal.signer_name,
        "signer_title": seal.signer_title,
        "legal_line": seal.legal_line,
        "contact_address": seal.contact_address,
        "contact_phone": seal.contact_phone,
        "contact_whatsapp": seal.contact_whatsapp,
        "contact_email": seal.contact_email,
        "contact_website": seal.contact_website,
        "contact_extra": seal.contact_extra,
        "place": seal.place,
        "certified_text": seal.certified_text,
        "show_date": seal.show_date,
        "show_certified": seal.show_certified,
        "show_stamp": seal.show_stamp,
        "show_signature": seal.show_signature,
    }


class CompanySealView(APIView):
    """
    GET  /api/stores/company-seal/ -> cachet, signature et textes (administrateurs)
    POST /api/stores/company-seal/ (multipart) : stamp, signature (photos), stamp_color / signature_color (original | blue | navy | black), remove_stamp, remove_signature, keep_background,
         enabled, signer_name, signer_title, place, certified_text, show_date
    """

    permission_classes = [permissions.IsAdminUser]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        from .models import CompanySeal

        return Response(seal_payload(CompanySeal.current()))

    def post(self, request):
        from .models import CompanySeal
        from .seal import process_seal_image

        seal = CompanySeal.current()
        d = request.data
        truthy = lambda v: str(v).lower() in ("1", "true", "yes", "on")
        keep_bg = truthy(d.get("keep_background", ""))
        from .seal import INK_COLORS, tint_stamp

        stamp_color = str(d.get("stamp_color") or seal.stamp_color or "original")
        if stamp_color != "original" and stamp_color not in INK_COLORS:
            stamp_color = "original"
        for field, attr in (("stamp", "stamp_png"), ("signature", "signature_png")):
            upload = request.FILES.get(field)
            if upload:
                if upload.size > 12 * 1024 * 1024:
                    raise ValidationError({field: "Image trop lourde (12 Mo maximum)."})
                try:
                    if field == "stamp":
                        # on garde le cachet d'origine : sa couleur peut ensuite etre changee sans renvoyer la photo
                        seal.stamp_source = process_seal_image(upload, remove_background=not keep_bg, color="original")
                    else:
                        seal.signature_png = process_seal_image(upload, remove_background=not keep_bg, color=str(d.get("signature_color") or "blue"))
                except Exception:
                    raise ValidationError({field: "Image illisible : envoyez une photo JPG ou PNG."})
            elif truthy(d.get(f"remove_{field}", "")):
                setattr(seal, attr, None)
                if field == "stamp":
                    seal.stamp_source = None
        seal.stamp_color = stamp_color
        if seal.stamp_source:
            seal.stamp_png = tint_stamp(seal.stamp_source, stamp_color)
        for f, mx in (("signer_name", 120), ("signer_title", 120), ("legal_line", 160), ("contact_address", 200), ("contact_phone", 60), ("contact_whatsapp", 60), ("contact_email", 120), ("contact_website", 120), ("contact_extra", 500), ("place", 80), ("certified_text", 80)):
            if f in d:
                setattr(seal, f, str(d.get(f) or "").strip()[:mx])
        if not seal.certified_text:
            seal.certified_text = "Certifié conforme"
        if "enabled" in d:
            seal.enabled = truthy(d.get("enabled"))
        if "show_date" in d:
            seal.show_date = truthy(d.get("show_date"))
        for f in ("show_certified", "show_stamp", "show_signature"):
            if f in d:
                setattr(seal, f, truthy(d.get(f)))
        seal.save()
        return Response(seal_payload(seal))
