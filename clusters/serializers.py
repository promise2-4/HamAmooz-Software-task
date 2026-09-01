from rest_framework import serializers

from .models import App, Cluster, Namespace


class ClusterSerializer(serializers.ModelSerializer):
    token = serializers.CharField(write_only=True, trim_whitespace=False)

    class Meta:
        model = Cluster
        fields = ["id", "name", "addr", "token", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_addr(self, value):
        if not value.startswith("https://"):
            raise serializers.ValidationError("The Kubernetes API address must use HTTPS.")
        return value.rstrip("/")

    def create(self, validated_data):
        token = validated_data.pop("token")
        cluster = Cluster(**validated_data)
        cluster.token = token
        cluster.save()
        return cluster

    def update(self, instance, validated_data):
        token = validated_data.pop("token", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if token is not None:
            instance.token = token
        instance.save()
        return instance


class NamespaceCreateSerializer(serializers.Serializer):
    name = serializers.RegexField(
        regex=r"^[a-z0-9]([-a-z0-9]*[a-z0-9])?$",
        max_length=63,
        error_messages={
            "invalid": "Use a valid DNS label: lowercase letters, numbers, and hyphens."
        },
    )


class NamespaceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Namespace
        fields = ["id", "cluster", "name", "status", "created_at"]
        read_only_fields = ["id", "status", "created_at"]


class AppSerializer(serializers.ModelSerializer):
    name = serializers.RegexField(
        regex=r"^[a-z0-9]([-a-z0-9]*[a-z0-9])?$",
        max_length=63,
        error_messages={"invalid": "Use a valid DNS label for the app name."},
    )

    class Meta:
        model = App
        fields = [
            "id",
            "namespace",
            "name",
            "image",
            "replicas",
            "cpu_request",
            "memory_request",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_replicas(self, value):
        if value > 20:
            raise serializers.ValidationError("replicas cannot be greater than 20.")
        return value
