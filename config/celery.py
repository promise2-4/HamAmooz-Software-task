import os

from celery import Celery
from celery.signals import worker_ready


os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("cluster_api")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()


@worker_ready.connect
def start_metrics_server(**kwargs):
    port = os.environ.get("PROMETHEUS_EXPORT_PORT")
    if not port:
        return

    from prometheus_client import start_http_server

    from config import metrics  # noqa: F401

    start_http_server(int(port), addr="0.0.0.0")
