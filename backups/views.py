import json
from datetime import timedelta

from celery.exceptions import CeleryError
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django_celery_beat.models import CrontabSchedule, PeriodicTask
from kombu.exceptions import OperationalError
from rest_framework import mixins, status, viewsets
from rest_framework.response import Response

from .models import Backup, BackupSchedule
from .serializers import BackupCreateSerializer, BackupSerializer
from .tasks import run_backup


class BackupViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    queryset = Backup.objects.select_related("app").all()
    serializer_class = BackupSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action == "list":
            app_id = self.request.query_params.get("app_id")
            if not app_id:
                return queryset.none()
            queryset = queryset.filter(app_id=app_id)
        return queryset

    def list(self, request, *args, **kwargs):
        if not request.query_params.get("app_id"):
            return Response(
                {"detail": "app_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().list(request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        backup = self.get_object()
        if (
            backup.status == Backup.Status.PENDING
            and backup.created_at < timezone.now() - timedelta(hours=24)
        ):
            backup.status = Backup.Status.FAILED
            backup.error_message = "Backup did not start within 24 hours."
            backup.finished_at = timezone.now()
            backup.save(update_fields=["status", "error_message", "finished_at"])
        return Response(self.get_serializer(backup).data)

    def create(self, request, *args, **kwargs):
        serializer = BackupCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        schedule_expression = values.get("schedule")

        if schedule_expression:
            schedule_id = self._create_schedule(
                app=values["app"],
                source_path=values["source_path"],
                expression=schedule_expression,
            )
            return Response(
                {"schedule_id": schedule_id, "status": "scheduled"},
                status=status.HTTP_201_CREATED,
            )

        backup = Backup.objects.create(app=values["app"], source_path=values["source_path"])
        try:
            run_backup.delay(backup.pk)
        except (CeleryError, OperationalError):
            backup.status = Backup.Status.FAILED
            backup.error_message = "The backup task could not be queued."
            backup.finished_at = timezone.now()
            backup.save(update_fields=["status", "error_message", "finished_at"])
            return Response(
                {"backup_id": backup.pk, "status": backup.status},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(
            {"backup_id": backup.pk, "status": backup.status},
            status=status.HTTP_202_ACCEPTED,
        )

    @staticmethod
    @transaction.atomic
    def _create_schedule(app, source_path, expression):
        minute, hour, day_of_month, month_of_year, day_of_week = expression.split()
        schedule_record = BackupSchedule(
            app=app,
            source_path=source_path,
            cron_expression=expression,
            periodic_task_name="pending",
        )
        schedule_record.periodic_task_name = f"backup-schedule-{schedule_record.pk}"
        schedule_record.save()
        crontab, _ = CrontabSchedule.objects.get_or_create(
            minute=minute,
            hour=hour,
            day_of_month=day_of_month,
            month_of_year=month_of_year,
            day_of_week=day_of_week,
            timezone=settings.TIME_ZONE,
        )
        PeriodicTask.objects.create(
            name=schedule_record.periodic_task_name,
            task="backups.tasks.run_scheduled_backup",
            crontab=crontab,
            args=json.dumps([schedule_record.pk]),
        )
        return schedule_record.pk
