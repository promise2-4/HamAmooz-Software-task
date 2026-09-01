from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from django.http import JsonResponse

from clusters.views import AppViewSet, ClusterViewSet, NamespaceViewSet
from backups.views import BackupViewSet


router = DefaultRouter()
router.register("clusters", ClusterViewSet, basename="cluster")
router.register("namespaces", NamespaceViewSet, basename="namespace")
router.register("apps", AppViewSet, basename="app")
router.register("backup", BackupViewSet, basename="backup")


def health(request):
    return JsonResponse({"status": "ok"})

urlpatterns = [
    path("health/", health, name="health"),
    path("", include("django_prometheus.urls")),
    path("admin/", admin.site.urls),
    path("api/", include(router.urls)),
    # Singular aliases match the assignment examples while plural REST routes remain available.
    path("api/namespace/", NamespaceViewSet.as_view({"get": "list", "post": "create"}), name="namespace-list"),
    path("api/namespace/<int:pk>/", NamespaceViewSet.as_view({"get": "retrieve", "delete": "destroy"}), name="namespace-detail"),
    path("api/app/", AppViewSet.as_view({"get": "list", "post": "create"}), name="app-list"),
    path("api/app/<int:pk>/", AppViewSet.as_view({"get": "retrieve", "patch": "partial_update", "put": "update", "delete": "destroy"}), name="app-detail"),
    path("api-auth/", include("rest_framework.urls")),
]
