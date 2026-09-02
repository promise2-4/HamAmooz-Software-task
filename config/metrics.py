from contextlib import contextmanager
from time import perf_counter

from prometheus_client import Counter, Gauge, Histogram


KUBERNETES_OPERATIONS = Counter(
    "hamamooz_kubernetes_operations_total",
    "Number of Kubernetes operations grouped by resource, operation, and outcome.",
    ("resource", "operation", "outcome"),
)

KUBERNETES_OPERATION_DURATION = Histogram(
    "hamamooz_kubernetes_operation_duration_seconds",
    "Duration of Kubernetes operations grouped by resource, operation, and outcome.",
    ("resource", "operation", "outcome"),
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30),
)

BACKUP_JOBS = Counter(
    "hamamooz_backup_jobs_total",
    "Number of backup jobs that reached a terminal outcome.",
    ("outcome",),
)

BACKUP_DURATION = Histogram(
    "hamamooz_backup_duration_seconds",
    "End-to-end duration of backup jobs that reached a terminal outcome.",
    ("outcome",),
    buckets=(0.1, 0.5, 1, 2.5, 5, 10, 30, 60, 300, 900, 1800, 3600),
)

BACKUPS_IN_PROGRESS = Gauge(
    "hamamooz_backups_in_progress",
    "Number of backup task executions currently running.",
)


def initialize_metrics():
    for outcome in ("success", "error"):
        KUBERNETES_OPERATIONS.labels("cluster", "list", outcome)
        KUBERNETES_OPERATION_DURATION.labels("cluster", "list", outcome)
    for outcome in ("completed", "failed"):
        BACKUP_JOBS.labels(outcome)
        BACKUP_DURATION.labels(outcome)


@contextmanager
def observe_kubernetes_operation(resource, operation):
    started = perf_counter()
    outcome = "error"
    try:
        yield
        outcome = "success"
    finally:
        KUBERNETES_OPERATIONS.labels(
            resource=resource,
            operation=operation,
            outcome=outcome,
        ).inc()
        KUBERNETES_OPERATION_DURATION.labels(
            resource=resource,
            operation=operation,
            outcome=outcome,
        ).observe(perf_counter() - started)


def observe_terminal_backup(backup, outcome, finished_at):
    BACKUP_JOBS.labels(outcome=outcome).inc()
    if backup.started_at:
        duration = max((finished_at - backup.started_at).total_seconds(), 0)
        BACKUP_DURATION.labels(outcome=outcome).observe(duration)


initialize_metrics()
