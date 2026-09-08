# Runtime dependency inventory

Only direct dependencies used by the application are declared. Transitive packages are resolved by pip or npm and must not be added manually.

## Backend

| Dependency | Runtime use |
|---|---|
| Django | Models, admin, configuration, ORM, and HTTP application |
| Django REST framework | Authentication, serializers, throttling, routers, and API views |
| kubernetes | Kubernetes Core, Apps, Version, and pod exec API clients |
| django-environ | Environment-based settings |
| gunicorn | Production WSGI server |
| cryptography | Fernet encryption for stored cluster tokens |
| Celery with Redis support | Asynchronous and scheduled backup tasks |
| django-celery-beat | Database-backed cron schedules |
| croniter | Five-field cron validation |
| django-prometheus | Django HTTP, process, and model metrics |
| prometheus-client | HamAmooz counters, gauges, histograms, and worker exporter |
| WhiteNoise | Django admin static files |

The backend image installs the exact tested versions from `requirements.txt`. Documentation, frontend sources, tests, local databases, virtual environments, and Kubernetes files are excluded from its build context.

## Frontend

Runtime packages are limited to React, React DOM, and React Router. TypeScript, Vite, the React Vite plugin, and type definitions are build-only development dependencies. The production image contains only Nginx and the generated static assets.

No component framework, CSS framework, icon package, state manager, or request library is installed. The interface uses reusable project components, CSS, browser `fetch`, and session-scoped Basic Auth credentials.

## Cluster monitoring

| Component | Purpose |
|---|---|
| VictoriaMetrics Operator | Reconciles only the VictoriaMetrics custom resources |
| VMAgent | Discovers `VMServiceScrape` objects and forwards samples |
| VMSingle | Stores and queries three days of metrics |
| VMAuth and VMUser | Optional authenticated read path for the secure iteration |
| Grafana | Provisions the assignment dashboard |
| Redis exporter | Adds Redis health and resource metrics to the same pipeline |

The remote stack does not deploy Prometheus, Alertmanager, kube-state-metrics, cAdvisor, or node-exporter. Those components are not required for the assignment metrics and would add unnecessary memory pressure.
