# HamAmooz Software Task

HamAmooz is a small Kubernetes management application built with Django REST Framework and React. It registers clusters, manages usable namespaces, deploys container workloads, schedules backups, and exposes application metrics for VictoriaMetrics and Grafana.

## Deployment

The deployment manifests target version `hamamooz-v1.4.0` on the two-node Hemmasian K3s cluster.

| Service | Address | Namespace |
|---|---|---|
| Web console and REST API | <http://hemmasian.osdl.ir:30080> | `hemmasian` |
| Grafana | <http://grafana.hemmasian.osdl.ir> | `monitoring-hamamooz-task` |

Both hostnames must resolve to the K3s ingress address. The current deployment uses HTTP, so TLS should be added before exposing it outside a trusted environment.

The application workloads are deliberately small: one backend replica, one frontend replica, Redis, one Celery worker, and one Celery Beat scheduler. Monitoring uses a single VMAgent and VMSingle instance with bounded storage and resource requests.

## Features

- Register a Kubernetes cluster with its API address and service-account token.
- Verify cluster connectivity and report the Kubernetes version.
- Create, list, and delete usable namespaces while hiding protected namespaces.
- Create, inspect, update, and delete Kubernetes Deployments.
- Keep test or inactive applications at zero replicas without removing their definitions.
- Run or schedule application backups through Celery.
- Cache live workload status in Redis.
- Use light or dark mode in the web console.
- Follow cluster resources through the sidebar navigation tree.
- Reuse session-cached resource data and refresh stale data when the browser regains focus.
- Enable optional 15, 30, or 60-second automatic refresh from the console toolbar.
- Create viewer accounts through the public sign-up page.
- Keep cluster changes restricted to staff and administrator accounts.
- Collect Kubernetes and backup metrics through VictoriaMetrics.

## Architecture

```text
Browser
  |
  v
Traefik Ingress
  |
  +-- React + Nginx ---- /api and /health ----> Django API
                                                   |
                                                   +-- Kubernetes API
                                                   +-- Redis
                                                   +-- Celery Worker / Beat

Django / Celery / Redis exporter
  |
  v
VMAgent --> VMSingle --> VMAuth --> Grafana
```

The public Nginx route does not expose `/metrics`. VMAgent collects metrics from internal Kubernetes Services, and Grafana reads them through authenticated VMAuth access.

## API

All management endpoints require Django Basic or Session authentication.

| Method | Path | Purpose |
|---|---|---|
| `GET`, `POST` | `/api/clusters/` | List or register clusters |
| `GET` | `/api/clusters/{id}/connection/` | Check Kubernetes connectivity |
| `GET`, `POST` | `/api/namespaces/` | List or create namespaces |
| `GET`, `DELETE` | `/api/namespaces/{id}/` | Read or delete a namespace |
| `GET`, `POST` | `/api/apps/` | List or deploy applications |
| `GET`, `PATCH`, `DELETE` | `/api/apps/{id}/` | Inspect, update, or delete an application |
| `GET`, `POST` | `/api/backup/` | List, queue, or schedule backups |
| `POST` | `/api/auth/register/` | Create a read-only viewer account |
| `GET` | `/api/auth/me/` | Read the signed-in user and role |
| `GET` | `/health/` | Backend health check |

Namespace lists require a cluster filter:

```bash
curl -u 'admin:password' \
  'http://hemmasian.osdl.ir:30080/api/namespaces/?cluster_id=1'
```

Create a namespace:

```bash
curl -u 'admin:password' \
  -X POST http://hemmasian.osdl.ir:30080/api/namespaces/ \
  -H 'Content-Type: application/json' \
  -d '{"cluster_id":1,"name":"demo-ns"}'
```

Create an application without consuming Pod capacity:

```bash
curl -u 'admin:password' \
  -X POST http://hemmasian.osdl.ir:30080/api/apps/ \
  -H 'Content-Type: application/json' \
  -d '{
    "namespace": 1,
    "name": "demo-app",
    "image": "nginx:1.27-alpine",
    "replicas": 0,
    "cpu_request": "25m",
    "memory_request": "32Mi"
  }'
```

## Application metrics

Django and Celery expose the assignment metrics below:

| Metric | Type | Purpose |
|---|---|---|
| `hamamooz_kubernetes_operations_total` | Counter | Kubernetes operation outcomes |
| `hamamooz_kubernetes_operation_duration_seconds` | Histogram | Kubernetes operation duration |
| `hamamooz_backup_jobs_total` | Counter | Completed and failed backup jobs |
| `hamamooz_backup_duration_seconds` | Histogram | Backup execution duration |
| `hamamooz_backups_in_progress` | Gauge | Backup jobs currently running |

Kubernetes metrics use the `resource`, `operation`, and `outcome` labels. Backup counters and histograms use the terminal `outcome` label.

The VictoriaMetrics operator manages `VMAgent`, `VMSingle`, `VMAuth`, `VMUser`, and `VMServiceScrape` resources. The Grafana dashboard **HamAmooz Task Metrics** contains twelve panels for target health, Kubernetes operations, latency, backup outcomes, duration, and current backup concurrency.

## Verify the remote deployment

Use a kubeconfig for the Hemmasian cluster, then run:

```bash
kubectl get nodes -o wide
kubectl get pods,svc,ingress -n hemmasian
kubectl get pods,svc,pvc -n monitoring-hamamooz-task
kubectl get vmsingle,vmagent,vmauth,vmuser,vmservicescrape \
  -n monitoring-hamamooz-task
```

Expected target health:

```text
backend-metrics  1
celery-metrics   1
redis-exporter   1
```

Check the public routes:

```bash
curl http://hemmasian.osdl.ir:30080/health/
curl http://grafana.hemmasian.osdl.ir/api/health
```

The complete deployment procedure, credential creation, image import, VictoriaMetrics installation, and verification queries are documented in [docs/REMOTE_DEPLOYMENT_GUIDE.md](docs/REMOTE_DEPLOYMENT_GUIDE.md).

## Run locally with Docker

Docker Compose provides the backend, frontend, Redis, Celery, Prometheus, and Grafana development stack.

```bash
docker compose up --build -d
docker compose exec backend python manage.py createsuperuser
```

Local addresses:

- Web console: <http://localhost:8000>
- REST API: <http://localhost:8000/api/>
- Grafana: <http://localhost:3000>
- Prometheus: <http://localhost:9090>

Check or stop the stack:

```bash
docker compose ps
curl http://localhost:8000/health/
docker compose down
```

Docker Compose uses development defaults when secrets are not supplied. Set `DJANGO_SECRET_KEY`, `KUBERNETES_TOKEN_ENCRYPTION_KEY`, and `GRAFANA_ADMIN_PASSWORD` through the environment before using a shared machine.

## Development

Backend:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py test
python manage.py runserver
```

Frontend:

```bash
cd frontend
npm ci
npm run dev
npm run build
```

Vite runs on port `5173` and proxies API calls to Django on port `8000`. Set `VITE_API_TARGET` to use another backend address.

## Release versions

- Backend image: `hemmasian-backend:1.3.0`
- Frontend image: `ghcr.io/promise2-4/hamamooz-software-task/frontend:hamamooz-v1.4.0`
- Grafana: `12.1.1`
- Release tag: `hamamooz-v1.4.0`

Cluster tokens are encrypted at rest and are never returned by the API. Kubernetes, Django, Grafana, and encryption credentials are stored in Kubernetes Secrets and are not committed to the repository.
