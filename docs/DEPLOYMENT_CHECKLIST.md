# Deployment readiness checklist

## Cluster capacity and placement

- [x] Both remote nodes are Ready; the current capacities are 4 CPU / 7.8 GiB on `hemmasian-ha1` and 2 CPU / 1.9 GiB on `hemmasian-ha2`.
- [x] The existing `memos` workload is explicitly preserved.
- [x] HamAmooz workloads use `hamamooz.io/workload-node=true` and are placed on the larger first node.
- [x] The complete application, worker, monitoring, and Grafana stack requests less than 1 GiB memory before workload data and filesystem cache.
- [x] The failed legacy kube-prometheus installation and optional nginx proof namespace are identified separately for safe cleanup.

## Backend API

- [x] Cluster `POST` persists name, HTTPS address, and an encrypted token without contacting Kubernetes.
- [x] Cluster `GET` never returns the token.
- [x] The connection endpoint performs an authenticated Kubernetes Version API request.
- [x] Namespace `POST` creates Kubernetes first and persists the database record only after success.
- [x] Namespace `GET` is filtered by `cluster_id` and uses the database as the source of truth.
- [x] Namespace `DELETE` removes Kubernetes and database state and treats a missing Kubernetes namespace idempotently.
- [x] Namespace names are validated as Kubernetes DNS labels.
- [x] Namespace creation is throttled to 10 requests per authenticated user per minute.
- [x] App create, list, retrieve, update, and delete operations manage Kubernetes Deployments and database records.
- [x] App state and ready replica counts are read live from Kubernetes.
- [x] Live App state is cached in Redis for 60 seconds and safely falls back to Kubernetes if cache access fails.
- [x] Replica count is capped and CPU/memory requests are validated as positive Kubernetes quantities.
- [x] Kubernetes conflicts, authorization errors, unavailable API errors, and invalid requests return appropriate HTTP status codes.
- [x] Immediate backups return `202` before the Celery worker performs the archive.
- [x] Backup IDs are stable across create, detail, and app-filtered list endpoints.
- [x] Backup status supports pending, running, completed, and failed states.
- [x] Backup output follows `backups/{app_id}/{date}/{backup_id}.tar.gz`.
- [x] Failed tasks retry twice; stale pending jobs are marked failed after 24 hours.
- [x] Scheduled backups use validated five-field cron expressions and create an independent backup per run.
- [x] Backend secrets are injected through Kubernetes Secrets and are not committed.
- [x] In-cluster Kubernetes access verifies TLS with the K3s CA certificate.

## Frontend

- [x] React and Vite production build completes.
- [x] Cluster list shows name, address, state, and namespace count.
- [x] Namespace list supports create, delete, refresh, app count, and confirmation.
- [x] App list supports create, delete, image, replicas, ready replicas, CPU, and memory.
- [x] App details show live status and support update and delete.
- [x] Router URLs preserve Cluster, Namespace, and App context.
- [x] Loading, error, retry, and empty states are present.
- [x] Frontend calls only Backend APIs and contains no mock cluster data.
- [x] Kubernetes Deployment, Service, health probes, resource limits, and Traefik Ingress are defined.
- [x] `/metrics` is not exposed through the public frontend Ingress.

## Metrics and monitoring

- [x] `hamamooz_kubernetes_operations_total` records resource, operation, and outcome.
- [x] `hamamooz_kubernetes_operation_duration_seconds` records operation duration.
- [x] `hamamooz_backup_jobs_total` records completed and failed jobs, including queue failures and stale jobs.
- [x] `hamamooz_backup_duration_seconds` records terminal backup duration.
- [x] `hamamooz_backups_in_progress` reports current Celery backup concurrency.
- [x] Django and Celery expose separate metrics endpoints through internal Services.
- [x] VMServiceScrape selects only HamAmooz services.
- [x] VMAgent remote-writes to a three-day VMSingle instance.
- [x] Only the VictoriaMetrics Operator is installed by Helm; pipeline components are plain custom resources.
- [x] VMAuth and VMUser protect read access, and Grafana uses the generated credentials instead of bypassing VMAuth.
- [x] Grafana is provisioned with VictoriaMetrics and a visualization for every required metric.
- [x] The remote monitoring manifest excludes the previous Prometheus stack.

## Verification evidence

- [x] Django system check passes.
- [x] No pending Django migrations are generated.
- [x] All 24 backend tests pass.
- [x] pip reports no broken dependency requirements.
- [x] npm clean install and production build pass.
- [x] npm reports no runtime dependency vulnerabilities.
- [x] Standard Kubernetes manifests pass client-side validation.
- [x] VictoriaMetrics custom resources pass server-side validation against operator chart `0.67.3` / operator `v0.74.1`.
- [x] A live authenticated VMAuth query succeeds on Minikube.
- [x] Grafana reports the VictoriaMetrics data source as healthy and provisions the HamAmooz dashboard.
- [x] The existing remote Backend database token successfully performs a read-only Kubernetes API request.
- [ ] Remote cleanup and deployment are intentionally left for the operator to run with `REMOTE_DEPLOYMENT_GUIDE.md`.
