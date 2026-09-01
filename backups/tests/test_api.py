from tempfile import TemporaryDirectory
from unittest.mock import patch
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from backups.models import Backup, BackupSchedule
from backups.tasks import run_backup
from clusters.models import App, Cluster, Namespace


FERNET_KEY = "MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA="


@override_settings(KUBERNETES_TOKEN_ENCRYPTION_KEY=FERNET_KEY)
class BackupApiTests(TestCase):
    def setUp(self):
        user = get_user_model().objects.create_user("tester", password="secret")
        self.client = APIClient()
        self.client.force_authenticate(user)
        cluster = Cluster(name="home-k3s", addr="https://94.101.187.131:6443")
        cluster.token = "service-account-token"
        cluster.save()
        namespace = Namespace.objects.create(cluster=cluster, name="demo-ns")
        self.app = App.objects.create(
            namespace=namespace,
            name="web",
            image="nginx:1.27",
        )

    @patch("backups.views.run_backup.delay")
    def test_immediate_backup_returns_pending_id_without_waiting(self, delay):
        response = self.client.post(
            "/api/backup/",
            {"app_id": self.app.pk, "source_path": "/var/lib/myapp/data.db"},
            format="json",
        )

        self.assertEqual(response.status_code, 202)
        self.assertTrue(response.data["backup_id"].startswith("bkp_"))
        self.assertEqual(response.data["status"], "pending")
        delay.assert_called_once_with(response.data["backup_id"])

    def test_status_and_app_backup_list_use_the_same_backup_id(self):
        backup = Backup.objects.create(app=self.app, source_path="/data/file.db")

        detail = self.client.get(f"/api/backup/{backup.pk}/")
        listing = self.client.get(f"/api/backup/?app_id={self.app.pk}")

        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["backup_id"], backup.pk)
        self.assertEqual(listing.data[0]["backup_id"], backup.pk)

    @patch("backups.views.PeriodicTask.objects.create")
    def test_scheduled_backup_creates_cron_schedule(self, create_periodic_task):
        response = self.client.post(
            "/api/backup/",
            {
                "app_id": self.app.pk,
                "source_path": "/var/lib/myapp/data.db",
                "schedule": "0 20 * * *",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["status"], "scheduled")
        self.assertTrue(BackupSchedule.objects.filter(pk=response.data["schedule_id"]).exists())
        create_periodic_task.assert_called_once()

    def test_invalid_source_path_and_cron_are_rejected(self):
        response = self.client.post(
            "/api/backup/",
            {"app_id": self.app.pk, "source_path": "relative/file", "schedule": "bad cron"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_status_marks_a_backup_pending_for_24_hours_as_failed(self):
        backup = Backup.objects.create(app=self.app, source_path="/data/file.db")
        Backup.objects.filter(pk=backup.pk).update(created_at=timezone.now() - timedelta(hours=25))

        response = self.client.get(f"/api/backup/{backup.pk}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "failed")

    @patch("backups.tasks.KubernetesGateway.archive_app_path")
    def test_worker_writes_completed_backup_to_expected_tree(self, archive_app_path):
        archive_app_path.return_value = b"\x1f\x8btest-archive"
        backup = Backup.objects.create(app=self.app, source_path="/data/file.db")

        with TemporaryDirectory() as directory, override_settings(BACKUP_ROOT=directory):
            run_backup.run(backup.pk)
            backup.refresh_from_db()

        self.assertEqual(backup.status, Backup.Status.COMPLETED)
        self.assertIn(f"/{self.app.pk}/", backup.output_path)
        self.assertTrue(backup.output_path.endswith(f"/{backup.pk}.tar.gz"))
