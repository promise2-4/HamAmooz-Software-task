from django.contrib import admin

from .models import App, Cluster, Namespace


@admin.register(Cluster)
class ClusterAdmin(admin.ModelAdmin):
    list_display = ["name", "addr", "created_at", "updated_at"]
    search_fields = ["name", "addr"]


@admin.register(Namespace)
class NamespaceAdmin(admin.ModelAdmin):
    list_display = ["name", "cluster", "status", "created_at"]
    list_filter = ["cluster", "status"]
    search_fields = ["name", "cluster__name"]


@admin.register(App)
class AppAdmin(admin.ModelAdmin):
    list_display = ["name", "namespace", "image", "replicas", "created_at", "updated_at"]
    list_filter = ["namespace__cluster"]
    search_fields = ["name", "namespace__name", "image"]
