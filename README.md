# HamAmooz Software Task

A cluster-management application built with Django REST Framework and React. It registers Kubernetes clusters, creates and lists usable namespaces, deploys applications, and schedules backups. The local stack runs with Docker Compose and includes lightweight monitoring.

## Components

| Component | Address | Description |
|---|---|---|
| Web console | <http://localhost:8000> | React frontend served by Nginx |
| REST API | <http://localhost:8000/api/> | Django API proxied through Nginx |
| Health check | <http://localhost:8000/health/> | Backend health endpoint |
| Grafana | <http://localhost:3000> | Provisioned monitoring dashboard |
| Prometheus | <http://localhost:9090> | Metrics and target status |

Redis, Celery Worker, and Celery Beat are internal services and are not exposed to the host.

## Quick start with Docker

Docker Desktop or Docker Engine with Docker Compose v2 is required.

```bash
cp .env.example .env
docker compose up --build -d
docker compose exec backend python manage.py createsuperuser
```

Open <http://localhost:8000> and sign in using the superuser. Initial Grafana credentials are `admin` / `admin`; change `GRAFANA_ADMIN_PASSWORD` in `.env` before any shared deployment.

Check the stack:

```bash
docker compose ps
curl http://localhost:8000/health/
curl http://localhost:9090/-/healthy
```

View logs:

```bash
docker compose logs -f backend frontend
docker compose logs -f prometheus grafana
```

Stop without deleting data:

```bash
docker compose down
```

Delete containers and local volumes only when their data is no longer needed:

```bash
docker compose down -v
```

## Monitoring

Prometheus collects Django request/process metrics, Redis metrics, Docker container CPU/memory metrics through cAdvisor, and its own metrics. Grafana is provisioned automatically with the Prometheus datasource and the **Hemmasian Overview** dashboard.

Prometheus retention is limited to three days or 1 GB, and each service has a memory limit. Target health is available at <http://localhost:9090/targets>. On Docker Desktop, cAdvisor observes containers inside Docker's Linux VM, which is expected.

## API routes

All API routes require Django Basic or Session authentication.

| Method | Path | Purpose |
|---|---|---|
| `GET`, `POST` | `/api/clusters/` | List or register clusters |
| `GET`, `POST` | `/api/namespaces/` | List or create tracked Kubernetes namespaces |
| `DELETE` | `/api/namespaces/{id}/` | Delete a namespace |
| `GET`, `POST` | `/api/apps/` | List or deploy applications |
| `GET`, `PATCH`, `DELETE` | `/api/apps/{id}/` | Read, update, or delete an application |
| `GET`, `POST` | `/api/backup/` | List, queue, or schedule backups |

Example namespace request:

```bash
curl -u admin:password -X POST http://localhost:8000/api/namespaces/ \
  -H 'Content-Type: application/json' \
  -d '{"cluster_id":1,"name":"demo-ns"}'
```

## Kubernetes access

Docker Compose does not create a local Kubernetes cluster. Namespace and deployment operations are sent to the API address registered for each cluster, so Docker must be able to reach that address, normally `https://<control-plane-ip>:6443`.

Apply the included RBAC manifest on the control-plane node and create a dedicated token:

```bash
sudo k3s kubectl apply -f k8s/cluster-api-rbac.yaml
sudo k3s kubectl -n kube-system create token cluster-api
```

Register the address and token through `/api/clusters/`. Keep TLS verification enabled and configure the cluster CA in production; disabling it is intended only for a trusted development environment.

## Development and tests

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
```

Vite runs on port `5173` and proxies API calls to Django on port `8000`. Override it with `VITE_API_TARGET` when needed.

## Version tags

- `backend-v1.0.0`: Django API, Kubernetes integration, backups, Redis, and Celery.
- `frontend-v1.0.0`: React management console.
- `docker-monitoring-v1.0.0`: complete Docker Compose stack with Prometheus and Grafana.

Cluster tokens are encrypted at rest and never returned by the API. Store `DJANGO_SECRET_KEY` and `KUBERNETES_TOKEN_ENCRYPTION_KEY` securely. Changing the encryption key after tokens are saved makes those values unreadable unless they are migrated.
