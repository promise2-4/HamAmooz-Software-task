from django.contrib import admin

from .models import Backup, BackupSchedule


@admin.register(Backup)
class BackupAdmin(admin.ModelAdmin):
    list_display = ["id", "app", "status", "created_at", "finished_at"]
    list_filter = ["status", "app__namespace__cluster"]
    search_fields = ["id", "app__name", "source_path"]
    readonly_fields = ["id", "created_at", "started_at", "finished_at"]


@admin.register(BackupSchedule)
class BackupScheduleAdmin(admin.ModelAdmin):
    list_display = ["id", "app", "cron_expression", "enabled", "created_at"]
    list_filter = ["enabled", "app__namespace__cluster"]
    search_fields = ["id", "app__name", "source_path"]
    readonly_fields = ["id", "periodic_task_name", "created_at"]
