import secrets

from django.db import models
from django_prometheus.models import ExportModelOperationsMixin

from clusters.models import App


def generate_backup_id():
    return f"bkp_{secrets.token_hex(6)}"


def generate_schedule_id():
    return f"sch_{secrets.token_hex(6)}"


class Backup(ExportModelOperationsMixin("backup"), models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        RUNNING = "running", "Running"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    id = models.CharField(primary_key=True, max_length=32, default=generate_backup_id, editable=False)
    app = models.ForeignKey(App, on_delete=models.CASCADE, related_name="backups")
    source_path = models.CharField(max_length=1000)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    output_path = models.CharField(max_length=1500, blank=True, default="")
    error_message = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.id


class BackupSchedule(ExportModelOperationsMixin("backup_schedule"), models.Model):
    id = models.CharField(primary_key=True, max_length=32, default=generate_schedule_id, editable=False)
    app = models.ForeignKey(App, on_delete=models.CASCADE, related_name="backup_schedules")
    source_path = models.CharField(max_length=1000)
    cron_expression = models.CharField(max_length=100)
    periodic_task_name = models.CharField(max_length=255, unique=True)
    enabled = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.id
