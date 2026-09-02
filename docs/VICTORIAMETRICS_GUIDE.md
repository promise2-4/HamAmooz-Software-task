# VictoriaMetrics learning and deployment guide

This guide stages the backend and monitoring pipeline without starting application replicas until the cluster capacity and control plane are healthy. Run commands from the repository root unless a command explicitly uses SSH.

## 1. Understand the data path

```text
Django /metrics ---------\
                         VMServiceScrape -> VMAgent -> remote write -> VMSingle -> VMUI or Grafana
Celery Worker :9808 -----/
```

`VMServiceScrape` selects the two Services carrying the `observability: hamamooz` label. `VMAgent` discovers those scrape definitions, fetches Prometheus text metrics every 15 seconds, and writes samples to `VMSingle`. VMUI is built into VMSingle and does not need another deployment.

### Local Minikube plus Docker Grafana

The local compose setup attaches only Grafana to Minikube's private Docker network. `vmsingle-hamamooz-nodeport` exposes VictoriaMetrics on node port `30428` inside that private network, and the provisioned datasource uses `http://minikube:30428`. This avoids losing dashboard data when a terminal running `kubectl port-forward` is closed. It is a local-development bridge and must not be copied to an internet-facing cluster.

The assignment-specific dashboard is provisioned as **HamAmooz Task Metrics** from `monitoring/grafana/dashboards/hamamooz-task-metrics.json` with a one-hour default range and 15-second refresh.

## 2. Verify the cluster before changing it

Run these on the control-plane node:

```bash
ssh ubuntu@94.101.187.131
sudo k3s kubectl get --raw='/readyz?verbose'
sudo k3s kubectl get nodes -o wide
sudo k3s kubectl top nodes
sudo k3s kubectl top pods -A --containers
sudo k3s kubectl get deploy,statefulset,daemonset -A -o wide
free -h
df -h / /var/lib/rancher/k3s
```

If `kubectl top` is unavailable, inspect requests and allocatable capacity instead:

```bash
sudo k3s kubectl describe nodes | sed -n '/Allocated resources:/,/Events:/p'
```

Do not continue while either node is `NotReady`, `/readyz` fails, memory is nearly exhausted, or disk usage is above 85%.

## 3. Stop only the HamAmooz workload

First inspect exact targets. Do not scale workloads from unrelated namespaces such as `memos`.

```bash
sudo k3s kubectl -n hemmasian get deploy
sudo k3s kubectl -n hemmasian scale deployment/backend deployment/redis deployment/celery-worker deployment/celery-beat --replicas=0
sudo k3s kubectl -n hemmasian get deploy
```

The repository manifest also keeps those four Deployments at zero replicas. Services, configuration, and workload definitions remain present, but the pods consume no CPU or memory.

If the earlier Prometheus/Grafana experiment exists in the `monitoring` namespace, stop only its known workloads too:

```bash
sudo k3s kubectl -n monitoring get deploy,daemonset
sudo k3s kubectl -n monitoring scale deployment/prometheus deployment/kube-state-metrics deployment/grafana --replicas=0
sudo k3s kubectl -n monitoring scale deployment/redis-exporter --replicas=0
sudo k3s kubectl -n monitoring patch daemonset node-exporter --type=merge \
  -p '{"spec":{"template":{"spec":{"nodeSelector":{"hamamooz.io/disabled":"true"}}}}}'
```

The impossible node selector preserves the DaemonSet object while scheduling zero pods. These commands do not touch the `memos` namespace.

## 4. Validate the staged backend manifest

The image must be available on the worker because the manifest uses `imagePullPolicy: Never`.

On the Mac, build an amd64 OCI image and copy it to the worker:

```bash
docker buildx build --platform linux/amd64 --tag hemmasian-backend:1.1.0 --output type=oci,dest=/tmp/hemmasian-backend-1.1.0.tar .
scp /tmp/hemmasian-backend-1.1.0.tar ubuntu@188.121.116.242:/tmp/
ssh ubuntu@188.121.116.242 'sudo k3s ctr images import /tmp/hemmasian-backend-1.1.0.tar'
ssh ubuntu@188.121.116.242 'sudo k3s ctr images list | grep hemmasian-backend'
```

Create the secret without storing values in Git, then apply the zero-replica manifest:

```bash
export DJANGO_KEY="$(openssl rand -hex 32)"
export FERNET_KEY="$(python3 -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')"

ssh ubuntu@94.101.187.131
sudo k3s kubectl create namespace hemmasian --dry-run=client -o yaml | sudo k3s kubectl apply -f -
sudo k3s kubectl -n hemmasian create secret generic backend-secret \
  --from-literal=DJANGO_SECRET_KEY='REPLACE_WITH_DJANGO_KEY' \
  --from-literal=KUBERNETES_TOKEN_ENCRYPTION_KEY='REPLACE_WITH_FERNET_KEY' \
  --dry-run=client -o yaml | sudo k3s kubectl apply -f -
sudo k3s kubectl apply --dry-run=server -f k8s/backend.yaml
sudo k3s kubectl apply -f k8s/backend.yaml
sudo k3s kubectl -n hemmasian get deploy,svc,pvc
```

Copying the repository to the control-plane node may be necessary before the last two commands. Keep the original encryption key if the database already contains encrypted cluster tokens.

## 5. Install only the VictoriaMetrics operator with Helm

Open one terminal to watch CRDs while the chart is installed from another terminal:

```bash
sudo k3s kubectl get crd --watch
```

Install the operator:

```bash
helm repo add vm https://victoriametrics.github.io/helm-charts/
helm repo update
helm upgrade --install vm-operator vm/victoria-metrics-operator \
  --namespace monitoring-hamamooz-task \
  --create-namespace \
  --set resources.requests.cpu=50m \
  --set resources.requests.memory=64Mi \
  --set resources.limits.memory=192Mi
```

Verify the operator and inspect the API it added:

```bash
sudo k3s kubectl -n monitoring-hamamooz-task rollout status deployment/vm-operator-victoria-metrics-operator
sudo k3s kubectl api-resources --api-group=operator.victoriametrics.com
sudo k3s kubectl explain vmsingle.spec
sudo k3s kubectl explain vmagent.spec
sudo k3s kubectl explain vmservicescrape.spec
```

## 6. Validate and start the simple pipeline manually

The operator chart is the only Helm-managed part. VMSingle, VMAgent, and VMServiceScrape are plain custom-resource manifests:

```bash
sudo k3s kubectl apply --dry-run=server -f k8s/victoriametrics/01-simple-pipeline.yaml
sudo k3s kubectl apply -f k8s/victoriametrics/01-simple-pipeline.yaml
sudo k3s kubectl -n monitoring-hamamooz-task get vmsingle,vmagent,vmservicescrape
sudo k3s kubectl -n monitoring-hamamooz-task get pods,svc,pvc
```

Only after capacity is acceptable, start the minimum functional backend:

```bash
sudo k3s kubectl -n hemmasian scale deployment/redis deployment/backend deployment/celery-worker --replicas=1
sudo k3s kubectl -n hemmasian rollout status deployment/redis
sudo k3s kubectl -n hemmasian rollout status deployment/backend
sudo k3s kubectl -n hemmasian rollout status deployment/celery-worker
```

Celery Beat is optional unless scheduled backups must run:

```bash
sudo k3s kubectl -n hemmasian scale deployment/celery-beat --replicas=1
```

Verify source endpoints and VMAgent discovery:

```bash
sudo k3s kubectl -n hemmasian port-forward service/backend-metrics 8001:8000
curl -s http://127.0.0.1:8001/metrics | grep '^hamamooz_'

sudo k3s kubectl -n monitoring-hamamooz-task port-forward service/vmagent-hamamooz 8429:8429
curl -s http://127.0.0.1:8429/api/v1/targets | jq '.data.activeTargets[] | {health, scrapeUrl, lastError}'
```

In another terminal, open VMSingle and query a metric:

```bash
sudo k3s kubectl -n monitoring-hamamooz-task port-forward service/vmsingle-hamamooz 8428:8428
curl -G http://127.0.0.1:8428/api/v1/query --data-urlencode 'query=hamamooz_backups_in_progress'
```

Open `http://127.0.0.1:8428/vmui` for the built-in visualization interface.

## 7. Prove real namespace and app operations

Use a disposable name and remove it at the end. The following assumes the backend is reachable at `http://127.0.0.1:8000`, the cluster record ID is `1`, and Basic Auth credentials are available.

```bash
curl -u 'admin:password' http://127.0.0.1:8000/api/clusters/1/connection/

curl -u 'admin:password' -X POST http://127.0.0.1:8000/api/namespaces/ \
  -H 'Content-Type: application/json' \
  -d '{"cluster_id":1,"name":"metrics-proof"}'

sudo k3s kubectl get namespace metrics-proof

curl -u 'admin:password' -X POST http://127.0.0.1:8000/api/apps/ \
  -H 'Content-Type: application/json' \
  -d '{"namespace":REPLACE_WITH_NAMESPACE_DATABASE_ID,"name":"proof-app","image":"nginx:1.27-alpine","replicas":0,"cpu_request":"25m","memory_request":"32Mi"}'

sudo k3s kubectl -n metrics-proof get deployment proof-app -o wide
```

Using zero app replicas proves that the API created a real Kubernetes Deployment without consuming pod memory. Query operation metrics after VMAgent has scraped again:

```bash
curl -G http://127.0.0.1:8428/api/v1/query \
  --data-urlencode 'query=sum(hamamooz_kubernetes_operations_total) by (resource,operation,outcome)'
```

Clean up through the API so delete operations are measured too:

```bash
curl -u 'admin:password' -X DELETE http://127.0.0.1:8000/api/apps/REPLACE_WITH_APP_DATABASE_ID/
curl -u 'admin:password' -X DELETE http://127.0.0.1:8000/api/namespaces/REPLACE_WITH_NAMESPACE_DATABASE_ID/
```

## 8. Secure the read path

Keep VMSingle and VMAgent as ClusterIP Services and access them only through local port-forwarding during the first iteration. The secure manifest adds VMAuth plus a generated-password, read-only VMUser:

```bash
sudo k3s kubectl apply --dry-run=server -f k8s/victoriametrics/02-secure-access.yaml
sudo k3s kubectl apply -f k8s/victoriametrics/02-secure-access.yaml
sudo k3s kubectl -n monitoring-hamamooz-task get vmauth,vmuser,secret
```

Inspect the generated secret name, decode its username and password locally, and never commit them:

```bash
sudo k3s kubectl -n monitoring-hamamooz-task get secret -l app.kubernetes.io/managed-by=vm-operator
sudo k3s kubectl -n monitoring-hamamooz-task get vmuser hamamooz-reader -o yaml
sudo k3s kubectl -n monitoring-hamamooz-task port-forward service/vmauth-hamamooz 8427:8427
```

VMAuth permits only VMUI and read/query API paths for this user; the remote-write path is intentionally excluded. Before adding an Ingress, configure a real DNS name, TLS certificate, and an IP allowlist. Do not expose VMSingle directly to the internet.

## 9. Visualize every custom metric

The Grafana dashboard JSON is at `monitoring/grafana/dashboards/hemmasian-overview.json`. For a cluster Grafana datasource, use `http://vmsingle-hamamooz.monitoring-hamamooz-task.svc:8428` inside the cluster or the authenticated VMAuth URL after the secure iteration.

Useful MetricsQL/PromQL queries:

```promql
sum(rate(hamamooz_kubernetes_operations_total[5m])) by (resource, operation, outcome)

histogram_quantile(0.95,
  sum(rate(hamamooz_kubernetes_operation_duration_seconds_bucket[5m]))
  by (le, resource, operation, outcome)
)

sum(increase(hamamooz_backup_jobs_total[$__range])) by (outcome)

histogram_quantile(0.95,
  sum(rate(hamamooz_backup_duration_seconds_bucket[5m]))
  by (le, outcome)
)

sum(hamamooz_backups_in_progress)
```

Counters answer how often something happened. Gauges answer the current state. Histograms preserve a distribution, so latency percentiles can be calculated later. Always aggregate histogram buckets by `le` plus the labels that must remain visible.

## 10. Roll back without deleting data

```bash
sudo k3s kubectl -n hemmasian scale deployment/backend deployment/redis deployment/celery-worker deployment/celery-beat --replicas=0
sudo k3s kubectl -n monitoring-hamamooz-task delete -f k8s/victoriametrics/02-secure-access.yaml
sudo k3s kubectl -n monitoring-hamamooz-task delete -f k8s/victoriametrics/01-simple-pipeline.yaml
```

The VMSingle PVC remains because `removePvcAfterDelete` is false. Delete that PVC only when its metric history is no longer needed.
