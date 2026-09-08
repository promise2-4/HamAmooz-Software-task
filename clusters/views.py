from django.db import IntegrityError, transaction
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.cache import cache
from kubernetes.client.exceptions import ApiException
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from redis.exceptions import RedisError
from urllib3.exceptions import HTTPError

from .kubernetes import KubernetesGateway
from .models import App, Cluster, Namespace
from .serializers import (
    AppSerializer,
    ClusterSerializer,
    NamespaceCreateSerializer,
    NamespaceSerializer,
)


def get_cached_status(key):
    try:
        return cache.get(key)
    except (RedisError, OSError):
        return None


def set_cached_status(key, value):
    try:
        cache.set(key, value, timeout=settings.APP_STATUS_CACHE_TTL)
    except (RedisError, OSError):
        pass


def delete_cached_status(key):
    try:
        cache.delete(key)
    except (RedisError, OSError):
        pass


def kubernetes_error(exc):
    if exc.status == 409:
        return Response({"detail": "The resource already exists."}, status=status.HTTP_409_CONFLICT)
    if exc.status in (401, 403):
        return Response(
            {"detail": "Kubernetes rejected the cluster credentials."},
            status=status.HTTP_502_BAD_GATEWAY,
        )
    return Response(
        {"detail": "Kubernetes API request failed.", "kubernetes_status": exc.status},
        status=status.HTTP_502_BAD_GATEWAY,
    )


class ClusterViewSet(viewsets.ModelViewSet):
    queryset = Cluster.objects.all()
    serializer_class = ClusterSerializer
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]

    @action(detail=True, methods=["get", "post"], url_path="namespaces")
    def namespaces(self, request, pk=None):
        cluster = self.get_object()
        if request.method == "GET":
            return Response(NamespaceSerializer(cluster.namespaces.all(), many=True).data)
        return create_namespace(request, cluster)

    @action(detail=True, methods=["get"], url_path="connection")
    def connection(self, request, pk=None):
        try:
            return Response(KubernetesGateway(self.get_object()).connection_status())
        except ApiException as exc:
            return kubernetes_error(exc)
        except (HTTPError, OSError, TimeoutError):
            return Response(
                {"detail": "Could not connect to the Kubernetes API."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except ImproperlyConfigured:
            return Response(
                {"detail": "The cluster token encryption key is invalid or cannot decrypt this cluster token."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )


def create_namespace(request, cluster):
    serializer = NamespaceCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    name = serializer.validated_data["name"]
    try:
        created = KubernetesGateway(cluster).create_namespace(name)
        try:
            namespace = Namespace.objects.create(
                cluster=cluster, name=name, status=created["status"] or "Active"
            )
        except IntegrityError:
            return Response(
                {"detail": "The namespace already exists in the backend database."},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(NamespaceSerializer(namespace).data, status=status.HTTP_201_CREATED)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    except ApiException as exc:
        return kubernetes_error(exc)
    except (HTTPError, OSError, TimeoutError):
        return Response(
            {"detail": "Could not connect to the Kubernetes API."},
            status=status.HTTP_502_BAD_GATEWAY,
        )
    except ImproperlyConfigured:
        return Response(
            {"detail": "The cluster token encryption key is invalid or cannot decrypt this cluster token."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )


class NamespaceViewSet(viewsets.ModelViewSet):
    queryset = Namespace.objects.select_related("cluster").all()
    serializer_class = NamespaceSerializer
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_throttles(self):
        if self.action == "create":
            self.throttle_scope = "namespace_create"
        return super().get_throttles()

    def get_queryset(self):
        queryset = super().get_queryset()
        cluster_id = self.request.query_params.get("cluster_id")
        if self.action == "list" and not cluster_id:
            return queryset.none()
        if cluster_id:
            queryset = queryset.filter(cluster_id=cluster_id)
        return queryset

    def create(self, request, *args, **kwargs):
        cluster_id = request.data.get("cluster_id")
        if not cluster_id:
            return Response({"detail": "cluster_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            cluster = Cluster.objects.get(pk=cluster_id)
        except Cluster.DoesNotExist:
            return Response({"detail": "Cluster not found."}, status=status.HTTP_404_NOT_FOUND)
        return create_namespace(request, cluster)

    def destroy(self, request, *args, **kwargs):
        with transaction.atomic():
            namespace = Namespace.objects.select_for_update().select_related("cluster").filter(
                pk=kwargs["pk"]
            ).first()
            if namespace is None:
                return Response(status=status.HTTP_404_NOT_FOUND)
            try:
                KubernetesGateway(namespace.cluster).delete_namespace(namespace.name)
            except ApiException as exc:
                if exc.status != 404:
                    return kubernetes_error(exc)
            except (HTTPError, OSError, TimeoutError):
                return Response(
                    {"detail": "Could not connect to the Kubernetes API."},
                    status=status.HTTP_502_BAD_GATEWAY,
                )
            except ImproperlyConfigured:
                return Response(
                    {"detail": "The cluster token encryption key is invalid or cannot decrypt this cluster token."},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
            namespace.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AppViewSet(viewsets.ModelViewSet):
    queryset = App.objects.select_related("namespace__cluster").all()
    serializer_class = AppSerializer
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]

    def get_throttles(self):
        if self.action == "create":
            self.throttle_scope = "app_create"
        return super().get_throttles()

    def get_queryset(self):
        queryset = super().get_queryset()
        namespace_id = self.request.query_params.get("namespace_id")
        if self.action == "list" and not namespace_id:
            return queryset.none()
        if namespace_id:
            queryset = queryset.filter(namespace_id=namespace_id)
        return queryset

    def _live_data(self, app):
        data = AppSerializer(app).data
        cache_key = f"app-status:{app.pk}"
        cached_status = get_cached_status(cache_key)
        if cached_status is not None:
            data.update(cached_status)
            return data
        try:
            live_status = KubernetesGateway(app.namespace.cluster).deployment_status(
                app.namespace.name, app.name
            )
            set_cached_status(cache_key, live_status)
        except ApiException as exc:
            live_status = {
                "ready": False,
                "status_error": f"Kubernetes status unavailable ({exc.status})",
            }
        except (HTTPError, OSError, TimeoutError):
            live_status = {
                "ready": False,
                "status_error": "Kubernetes status unavailable",
            }
        data.update(live_status)
        return data

    def list(self, request, *args, **kwargs):
        return Response([self._live_data(app) for app in self.get_queryset()])

    def retrieve(self, request, *args, **kwargs):
        return Response(self._live_data(self.get_object()))

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        namespace_id = serializer.validated_data["namespace"].pk
        namespace = Namespace.objects.select_related("cluster").filter(pk=namespace_id).first()
        if namespace is None:
            return Response({"detail": "Namespace not found."}, status=status.HTTP_404_NOT_FOUND)
        values = serializer.validated_data
        try:
            KubernetesGateway(namespace.cluster).create_deployment(
                namespace.name,
                values["name"],
                values["image"],
                values["replicas"],
                values.get("cpu_request", ""),
                values.get("memory_request", ""),
            )
            app = App.objects.create(**values)
        except IntegrityError:
            return Response({"detail": "The app already exists."}, status=status.HTTP_409_CONFLICT)
        except ApiException as exc:
            return kubernetes_error(exc)
        except (HTTPError, OSError, TimeoutError):
            return Response({"detail": "Could not connect to the Kubernetes API."}, status=status.HTTP_502_BAD_GATEWAY)
        except ImproperlyConfigured:
            return Response(
                {"detail": "The cluster token encryption key is invalid or cannot decrypt this cluster token."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(self._live_data(app), status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        app = self.get_object()
        serializer = self.get_serializer(app, data=request.data, partial=kwargs.get("partial", False))
        serializer.is_valid(raise_exception=True)
        values = {field: serializer.validated_data.get(field, getattr(app, field)) for field in ["image", "replicas", "cpu_request", "memory_request"]}
        try:
            KubernetesGateway(app.namespace.cluster).update_deployment(
                app.namespace.name, app.name, values["image"], values["replicas"], values["cpu_request"], values["memory_request"]
            )
        except ApiException as exc:
            return kubernetes_error(exc)
        except (HTTPError, OSError, TimeoutError):
            return Response({"detail": "Could not connect to the Kubernetes API."}, status=status.HTTP_502_BAD_GATEWAY)
        except ImproperlyConfigured:
            return Response(
                {"detail": "The cluster token encryption key is invalid or cannot decrypt this cluster token."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        for field, value in values.items():
            setattr(app, field, value)
        app.save()
        delete_cached_status(f"app-status:{app.pk}")
        return Response(self._live_data(app))

    def destroy(self, request, *args, **kwargs):
        with transaction.atomic():
            app = App.objects.select_for_update().select_related("namespace__cluster").filter(pk=kwargs["pk"]).first()
            if app is None:
                return Response(status=status.HTTP_404_NOT_FOUND)
            try:
                KubernetesGateway(app.namespace.cluster).delete_deployment(app.namespace.name, app.name)
            except ApiException as exc:
                if exc.status != 404:
                    return kubernetes_error(exc)
            except (HTTPError, OSError, TimeoutError):
                return Response({"detail": "Could not connect to the Kubernetes API."}, status=status.HTTP_502_BAD_GATEWAY)
            except ImproperlyConfigured:
                return Response(
                    {"detail": "The cluster token encryption key is invalid or cannot decrypt this cluster token."},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
            delete_cached_status(f"app-status:{app.pk}")
            app.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
