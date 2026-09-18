from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView


class AdminTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        if not self.user.is_staff:
            from rest_framework import serializers

            raise serializers.ValidationError("Ce compte n'a pas acces au tableau de bord admin.")
        data["is_staff"] = self.user.is_staff
        data["username"] = self.user.username
        return data


class AdminLoginView(TokenObtainPairView):
    serializer_class = AdminTokenObtainPairSerializer
