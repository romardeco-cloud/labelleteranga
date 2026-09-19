from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import permissions, serializers, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import AdminSecurityCode, CashierProfile


class AdminTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        if not self.user.is_staff:
            raise serializers.ValidationError("Ce compte n'a pas acces au tableau de bord admin.")
        data["is_staff"] = self.user.is_staff
        data["username"] = self.user.username
        return data


class AdminLoginView(TokenObtainPairView):
    serializer_class = AdminTokenObtainPairSerializer


class CashierTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        profile = getattr(self.user, "cashier_profile", None)
        if not profile or not profile.is_active:
            raise serializers.ValidationError("Ce compte n'est pas un compte caissier actif.")
        data["username"] = self.user.username
        data["point_of_sale"] = profile.point_of_sale_id
        data["point_of_sale_name"] = profile.point_of_sale.name
        return data


class CashierLoginView(TokenObtainPairView):
    serializer_class = CashierTokenObtainPairSerializer


class CashierSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username")
    password = serializers.CharField(write_only=True, required=False, min_length=8)
    point_of_sale_name = serializers.CharField(source="point_of_sale.name", read_only=True)

    class Meta:
        model = CashierProfile
        fields = ["id", "username", "password", "point_of_sale", "point_of_sale_name", "is_active", "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate_username(self, value):
        User = get_user_model()
        qs = User.objects.filter(username=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.user_id)
        if qs.exists():
            raise serializers.ValidationError("Ce nom d'utilisateur existe deja.")
        return value

    @transaction.atomic
    def create(self, validated_data):
        user_data = validated_data.pop("user")
        password = validated_data.pop("password", None)
        if not password:
            raise serializers.ValidationError({"password": "Mot de passe requis (8 caracteres minimum)."})
        user = get_user_model().objects.create_user(username=user_data["username"], password=password)
        return CashierProfile.objects.create(user=user, **validated_data)

    @transaction.atomic
    def update(self, instance, validated_data):
        user_data = validated_data.pop("user", None)
        password = validated_data.pop("password", None)
        if user_data and "username" in user_data:
            instance.user.username = user_data["username"]
        if password:
            instance.user.set_password(password)
        instance.user.is_active = validated_data.get("is_active", instance.is_active)
        instance.user.save()
        return super().update(instance, validated_data)


class CashierViewSet(viewsets.ModelViewSet):
    """Gestion des comptes caissiers, reservee aux administrateurs."""

    queryset = CashierProfile.objects.select_related("user", "point_of_sale").all()
    serializer_class = CashierSerializer
    permission_classes = [permissions.IsAdminUser]

    @transaction.atomic
    def perform_destroy(self, instance):
        """
        Supprime le compte caissier. Sans historique : compte supprime. Avec ventes ou fermetures de caisse : le compte est retire
        de la liste et ne peut plus se connecter, mais l'historique (ventes, fermetures, rapports) reste attribue a son nom.
        """
        from apps.orders.models import Order
        from apps.reports.models import DailyClosing

        user = instance.user
        has_history = Order.objects.filter(cashier=user).exists() or DailyClosing.objects.filter(cashier=user).exists()
        if user.is_staff or user.is_superuser:
            instance.delete()  # ne jamais supprimer un compte administrateur
            return
        instance.delete()
        if has_history:
            user.username = f"supprime-{user.pk}-{user.username}"[:150]
            user.is_active = False
            user.set_unusable_password()
            user.save()
        else:
            user.delete()


class StaffListView(APIView):
    """GET /api/accounts/staff/ : comptes administrateurs (lecture seule)."""

    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        users = get_user_model().objects.filter(is_staff=True, is_active=True).order_by("username")
        return Response(
            [
                {
                    "id": u.id,
                    "username": u.username,
                    "email": u.email,
                    "role": "Proprietaire" if u.is_superuser else "Administrateur",
                    "last_login": u.last_login,
                }
                for u in users
            ]
        )


class SecurityCodeView(APIView):
    """
    GET  /api/accounts/security-code/ -> {is_set}
    POST /api/accounts/security-code/ {new_pin, current_pin?} : definit ou change le code (le code actuel est exige
    des qu'un code existe).
    """

    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        return Response({"is_set": AdminSecurityCode.current().is_set})

    def post(self, request):
        code = AdminSecurityCode.current()
        new_pin = str(request.data.get("new_pin") or "")
        AdminSecurityCode.validate_format(new_pin)
        if code.is_set:
            code.verify(str(request.data.get("current_pin") or ""))
        code.set_pin(new_pin)
        return Response({"is_set": True})
