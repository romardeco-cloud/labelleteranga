from django import forms
from django.contrib import admin, messages

from .models import Order, OrderItem
from .services import closed_pos_day_for, mark_order_paid, void_order


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ["product", "product_name", "unit_price", "quantity"]


@admin.action(description="Marquer comme payee (declenche la confirmation WhatsApp)")
def mark_as_paid(modeladmin, request, queryset):
    for order in queryset.exclude(status=Order.Status.PAID):
        mark_order_paid(order)


@admin.action(description="Annuler la vente (motif obligatoire si la journee est cloturee)")
def void_selected_orders(modeladmin, request, queryset):
    for order in queryset.exclude(status=Order.Status.CANCELLED):
        try:
            void_order(order, request.user, "Annulation depuis l'admin")
        except Exception as exc:  # ValidationError DRF -> message lisible pour l'admin
            detail = getattr(exc, "detail", None) or str(exc)
            modeladmin.message_user(request, f"{order.reference} : {detail}", level=messages.ERROR)


class OrderAdminForm(forms.ModelForm):
    """
    Empeche de contourner void_order()/change_order_payment_method() en modifiant directement le statut ou
    le mode de paiement d'une vente de caisse depuis le formulaire admin une fois sa journee de caisse
    cloturee (DailyClosing est un instantane fige : une modification silencieuse ici fausserait la
    comptabilite deja enregistree sans que rien ne le signale). Utilisez plutot l'action "Annuler la vente"
    ci-dessous, qui passe par le meme controle et laisse une trace sur la fermeture concernee.
    """

    class Meta:
        model = Order
        fields = "__all__"

    def clean(self):
        cleaned = super().clean()
        order = self.instance
        if order.pk and closed_pos_day_for(order):
            original = Order.objects.get(pk=order.pk)
            for field in ("status", "payment_method", "total_amount"):
                if field in cleaned and cleaned[field] != getattr(original, field):
                    self.add_error(
                        field,
                        "Journee de caisse deja cloturee : ce champ ne peut plus etre modifie directement ici. "
                        "Utilisez l'action « Annuler la vente » pour garder une trace de la correction.",
                    )
        return cleaned


class PendingManualPaymentFilter(admin.SimpleListFilter):
    """
    Paiements Wave/Orange Money "manuels" (QR code, sans API marchande) : le client a declare avoir paye,
    mais la vente reste PENDING et absente de tous les totaux tant que quelqu'un ne clique pas "Marquer
    payee". Ce filtre les rend faciles a retrouver pour eviter qu'une vente reelle reste indefiniment invisible
    dans les rapports faute de confirmation.
    """

    title = "paiement declare, a confirmer"
    parameter_name = "payment_declared_pending"

    def lookups(self, request, model_admin):
        return [("1", "Oui - a verifier et confirmer")]

    def queryset(self, request, queryset):
        if self.value() == "1":
            return queryset.filter(status=Order.Status.PENDING, payment_declared_at__isnull=False)
        return queryset


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    form = OrderAdminForm
    list_display = [
        "reference",
        "customer_name",
        "payment_method",
        "status",
        "total_amount",
        "payment_declared_at",
        "created_at",
        "paid_at",
    ]
    list_filter = ["status", "payment_method", PendingManualPaymentFilter, "created_at"]
    search_fields = ["reference", "customer_name", "customer_email"]
    inlines = [OrderItemInline]
    actions = [mark_as_paid, void_selected_orders]
    readonly_fields = [
        "reference",
        "stripe_checkout_session_id",
        "stripe_payment_intent_id",
        "wave_checkout_id",
        "orange_money_order_id",
        "whatsapp_confirmation_sent_at",
        "created_at",
        "paid_at",
    ]
