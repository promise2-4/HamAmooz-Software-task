# VictoriaMetrics pipeline guide

The remote installation sequence and exact commands are in [REMOTE_DEPLOYMENT_GUIDE.md](REMOTE_DEPLOYMENT_GUIDE.md). This document explains the monitoring data path and each required metric.

## Data path

```text
Django /metrics ---------\
                         VMServiceScrape -> VMAgent -> remote write -> VMSingle
Celery Worker :9808 -----/                                      |
Redis Exporter :9121 ----/                                      +-> VMUI
                                                               +-> Grafana
```

The VictoriaMetrics Operator is the only Helm-managed component. VMSingle, VMAgent, VMServiceScrape, VMAuth, and VMUser are applied as plain custom resources so each part of the pipeline stays visible and understandable.

`VMServiceScrape` selects only Services labeled `observability: hamamooz` in the `hemmasian` namespace. VMAgent scrapes them every 15 seconds and remote-writes samples to VMSingle. VMSingle retains three days of data in a 2 GiB persistent volume.

## Required application metrics

| Metric | Type | What it observes |
|---|---|---|
| `hamamooz_kubernetes_operations_total` | Counter | How many Kubernetes operations ended in success or error |
| `hamamooz_kubernetes_operation_duration_seconds` | Histogram | The latency distribution of Kubernetes operations |
| `hamamooz_backup_jobs_total` | Counter | How many backup jobs completed or failed |
| `hamamooz_backup_duration_seconds` | Histogram | The end-to-end duration distribution of terminal backup jobs |
| `hamamooz_backups_in_progress` | Gauge | How many Celery backup tasks are running now |

Kubernetes metrics use the labels:

- `resource`: `cluster`, `namespace`, or `app`
- `operation`: `create`, `list`, `update`, or `delete`
- `outcome`: `success` or `error`

Backup terminal metrics use `outcome=completed` or `outcome=failed`.

Counters only increase and are suitable for totals, rates, and error ratios. Gauges can increase and decrease with current state. Histograms store buckets so p50, p95, and p99 can be calculated after collection.

## Useful queries

```promql
sum by (resource, operation, outcome) (
  rate(hamamooz_kubernetes_operations_total[5m])
)
```

```promql
histogram_quantile(
  0.95,
  sum by (le, resource, operation, outcome) (
    rate(hamamooz_kubernetes_operation_duration_seconds_bucket[5m])
  )
)
```

```promql
sum by (outcome) (increase(hamamooz_backup_jobs_total[$__range]))
```

```promql
histogram_quantile(
  0.95,
  sum by (le, outcome) (
    rate(hamamooz_backup_duration_seconds_bucket[5m])
  )
)
```

```promql
sum(hamamooz_backups_in_progress)
```

Always keep `le` while aggregating histogram buckets. Without it, percentile calculations are invalid.

## Simple and secure iterations

The first iteration uses `01-simple-pipeline.yaml`. VMSingle and VMAgent remain ClusterIP-only on the remote cluster, so VMUI is opened with port-forwarding:

```bash
kubectl -n monitoring-hamamooz-task port-forward service/vmsingle-hamamooz 8428:8428
```

Open `http://127.0.0.1:8428/vmui`.

The second iteration applies `02-secure-access.yaml`, which creates VMAuth and a read-only VMUser. Grafana reads through VMAuth with the generated Kubernetes Secret. VMSingle still has no public Ingress or NodePort. Add public exposure only after DNS, TLS, and an IP allowlist are ready.

`03-local-nodeport.yaml` is exclusively for the Docker Grafana plus Minikube development setup. Never apply it to the remote nodes.

## Grafana

The Kubernetes Grafana manifest points directly to the internal VMSingle Service and provisions `hamamooz-task-metrics.json`. It includes target health, current values, operation outcomes, and p95 duration panels for all five assignment metrics.

No sample metric generator is part of the image or deployment. Dashboard values come only from Django, Celery, Redis exporter, and VictoriaMetrics.
