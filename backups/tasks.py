from datetime import timedelta
from pathlib import Path

from celery import shared_task
from django.conf import settings
from django.utils import timezone

from clusters.kubernetes import KubernetesGateway

from .models import Backup, BackupSchedule


@shared_task(bind=True, max_retries=2, default_retry_delay=15, name="backups.tasks.run_backup")
def run_backup(self, backup_id):
    backup = Backup.objects.select_related("app__namespace__cluster").get(pk=backup_id)
    backup.status = Backup.Status.RUNNING
    backup.started_at = timezone.now()
    backup.error_message = ""
    backup.save(update_fields=["status", "started_at", "error_message"])

    try:
        app = backup.app
        archive = KubernetesGateway(app.namespace.cluster).archive_app_path(
            namespace=app.namespace.name,
            app_name=app.name,
            source_path=backup.source_path,
        )
        date_folder = timezone.localdate().isoformat()
        output_directory = Path(settings.BACKUP_ROOT) / str(app.pk) / date_folder
        output_directory.mkdir(parents=True, exist_ok=True)
        output_path = output_directory / f"{backup.id}.tar.gz"
        output_path.write_bytes(archive)
    except Exception as exc:
        if self.request.retries < self.max_retries:
            backup.status = Backup.Status.PENDING
            backup.error_message = "Backup attempt failed and will be retried."
            backup.save(update_fields=["status", "error_message"])
            raise self.retry(exc=exc)
        backup.status = Backup.Status.FAILED
        backup.error_message = str(exc)[:1000]
        backup.finished_at = timezone.now()
        backup.save(update_fields=["status", "error_message", "finished_at"])
        return

    backup.status = Backup.Status.COMPLETED
    backup.output_path = str(output_path)
    backup.finished_at = timezone.now()
    backup.save(update_fields=["status", "output_path", "finished_at"])


@shared_task(name="backups.tasks.run_scheduled_backup")
def run_scheduled_backup(schedule_id):
    schedule = BackupSchedule.objects.select_related("app").filter(pk=schedule_id, enabled=True).first()
    if schedule is None:
        return
    backup = Backup.objects.create(app=schedule.app, source_path=schedule.source_path)
    run_backup.delay(backup.pk)


@shared_task(name="backups.tasks.mark_stale_backups")
def mark_stale_backups():
    threshold = timezone.now() - timedelta(hours=24)
    Backup.objects.filter(status=Backup.Status.PENDING, created_at__lt=threshold).update(
        status=Backup.Status.FAILED,
        error_message="Backup did not start within 24 hours.",
        finished_at=timezone.now(),
    )
