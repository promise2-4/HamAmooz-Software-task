from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.db import models


class Cluster(models.Model):
    name = models.CharField(max_length=100, unique=True)
    addr = models.URLField(
        max_length=500,
        help_text="Kubernetes API URL, for example https://10.0.0.10:6443",
    )
    encrypted_token = models.TextField(
        help_text="Encrypted Kubernetes service-account bearer token"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name

    @staticmethod
    def _cipher():
        key = settings.KUBERNETES_TOKEN_ENCRYPTION_KEY
        if not key:
            raise ImproperlyConfigured(
                "KUBERNETES_TOKEN_ENCRYPTION_KEY must be set to a Fernet key."
            )
        try:
            return Fernet(key.encode())
        except (TypeError, ValueError) as exc:
            raise ImproperlyConfigured(
                "KUBERNETES_TOKEN_ENCRYPTION_KEY is not a valid Fernet key."
            ) from exc

    @property
    def token(self):
        try:
            return self._cipher().decrypt(self.encrypted_token.encode()).decode()
        except InvalidToken as exc:
            raise ImproperlyConfigured(
                "The cluster token cannot be decrypted with the configured key."
            ) from exc

    @token.setter
    def token(self, value):
        self.encrypted_token = self._cipher().encrypt(value.encode()).decode()


class Namespace(models.Model):
    cluster = models.ForeignKey(Cluster, on_delete=models.CASCADE, related_name="namespaces")
    name = models.CharField(max_length=63)
    status = models.CharField(max_length=32, default="Active")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["cluster", "name"], name="unique_namespace_per_cluster")
        ]

    def __str__(self):
        return f"{self.cluster.name}/{self.name}"


class App(models.Model):
    namespace = models.ForeignKey(Namespace, on_delete=models.CASCADE, related_name="apps")
    name = models.CharField(max_length=63)
    image = models.CharField(max_length=500)
    replicas = models.PositiveIntegerField(default=1)
    cpu_request = models.CharField(max_length=32, blank=True, default="")
    memory_request = models.CharField(max_length=32, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["namespace", "name"], name="unique_app_per_namespace")
        ]

    def __str__(self):
        return f"{self.namespace}/{self.name}"
