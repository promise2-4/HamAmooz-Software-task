from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView


class RegistrationSerializer(serializers.Serializer):
    username = serializers.CharField(min_length=3, max_length=150)
    email = serializers.EmailField(required=False, allow_blank=True)
    password = serializers.CharField(min_length=8, max_length=128, write_only=True, trim_whitespace=False)
    password_confirm = serializers.CharField(max_length=128, write_only=True, trim_whitespace=False)

    def validate_username(self, value):
        username = value.strip()
        if get_user_model().objects.filter(username__iexact=username).exists():
            raise serializers.ValidationError("This username is already in use.")
        return username

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError({"password_confirm": "Passwords do not match."})
        try:
            validate_password(attrs["password"])
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)}) from exc
        return attrs

    def create(self, validated_data):
        validated_data.pop("password_confirm")
        password = validated_data.pop("password")
        try:
            return get_user_model().objects.create_user(password=password, **validated_data)
        except IntegrityError as exc:
            raise serializers.ValidationError({"username": "This username is already in use."}) from exc


def user_payload(user):
    return {
        "username": user.get_username(),
        "email": user.email,
        "is_staff": user.is_staff,
        "role": "Administrator" if user.is_staff else "Viewer",
    }


class RegisterView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "registration"

    def post(self, request):
        serializer = RegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(user_payload(user), status=status.HTTP_201_CREATED)


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(user_payload(request.user))
