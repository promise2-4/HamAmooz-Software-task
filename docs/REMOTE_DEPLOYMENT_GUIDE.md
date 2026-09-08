# Remote K3s deployment guide

This guide deploys the verified application to the two-node Hemmasian K3s cluster. Run local commands from the repository root on the Mac. Commands prefixed with `ssh` run on the control-plane node.

## 1. Set reusable values

```bash
export CONTROL_PLANE=94.101.187.131
export WORKER=188.121.116.242
export DEPLOY_DIR=/home/ubuntu/hamamooz-deploy
```

Keep `memos`, `kube-system`, `default`, `kube-public`, and `kube-node-lease`. Do not delete K3s data under `/var/lib/rancher/k3s`.

## 2. Inspect and back up before cleanup

```bash
ssh ubuntu@$CONTROL_PLANE 'sudo k3s kubectl get nodes -o wide'
ssh ubuntu@$CONTROL_PLANE 'sudo k3s kubectl get pods,deploy,statefulset,daemonset,pvc -A'
ssh ubuntu@$CONTROL_PLANE 'free -h && df -h / /var/lib/rancher/k3s'
```

The old `hemmasian` PVCs are local to the worker node. First create a consistent SQLite snapshot, then archive that snapshot and the backup files before a clean reinstall:

```bash
ssh ubuntu@$CONTROL_PLANE \
  "sudo k3s kubectl exec -n hemmasian deployment/celery-worker -c celery-worker -- python -c \"import sqlite3; source=sqlite3.connect('/data/db.sqlite3'); target=sqlite3.connect('/data/db.sqlite3.snapshot'); source.backup(target); target.close(); source.close()\""

ssh ubuntu@$CONTROL_PLANE \
  'sudo k3s kubectl exec -n hemmasian deployment/celery-worker -c celery-worker -- tar -czf - /data/db.sqlite3.snapshot /backups' \
  > hemmasian-data-before-redeploy.tar.gz

tar -tzf hemmasian-data-before-redeploy.tar.gz | head
```

The old `monitoring` namespace is a failed kube-prometheus-stack installation. Remove its K3s HelmChart first so the Helm controller cannot recreate it, then remove the namespace:

```bash
ssh ubuntu@$CONTROL_PLANE \
  'sudo k3s kubectl delete helmchart -n kube-system prometheus-stack --ignore-not-found'
ssh ubuntu@$CONTROL_PLANE \
  'sudo k3s kubectl delete namespace monitoring --ignore-not-found --wait=true'
```

`demo-ns` contains the earlier nginx proof Deployment. Delete it only if that proof is no longer needed:

```bash
ssh ubuntu@$CONTROL_PLANE 'sudo k3s kubectl get all -n demo-ns'
ssh ubuntu@$CONTROL_PLANE 'sudo k3s kubectl delete namespace demo-ns'
```

After the backup is verified, remove the old task installation and obsolete RBAC. This deletes the old task database and backup PVCs:

```bash
ssh ubuntu@$CONTROL_PLANE \
  'sudo k3s kubectl delete namespace hemmasian --ignore-not-found --wait=true'
ssh ubuntu@$CONTROL_PLANE \
  'sudo k3s kubectl delete clusterrolebinding cluster-api-manager --ignore-not-found'
ssh ubuntu@$CONTROL_PLANE \
  'sudo k3s kubectl delete clusterrole cluster-api-manager --ignore-not-found'
ssh ubuntu@$CONTROL_PLANE \
  'sudo k3s kubectl delete serviceaccount cluster-api -n kube-system --ignore-not-found'
```

Do not continue until both nodes are `Ready` and the old failed monitoring pods are gone.

## 3. Reserve the larger node for HamAmooz

The first node has the larger memory capacity. All stateful and application components use this label:

```bash
ssh ubuntu@$CONTROL_PLANE \
  'sudo k3s kubectl label node hemmasian-ha1 hamamooz.io/workload-node=true --overwrite'
```

## 4. Build small amd64 images and import them

The manifests use local versioned image names and `IfNotPresent`. Import both images to both nodes so a later placement change does not cause an image pull failure.

```bash
docker buildx build \
  --platform linux/amd64 \
  --tag hemmasian-backend:1.2.0 \
  --provenance=false \
  --output type=oci,dest=/tmp/hemmasian-backend-1.2.0.tar \
  .

docker buildx build \
  --platform linux/amd64 \
  --tag hemmasian-frontend:1.1.0 \
  --provenance=false \
  --output type=oci,dest=/tmp/hemmasian-frontend-1.1.0.tar \
  ./frontend

for NODE in $CONTROL_PLANE $WORKER; do
  scp /tmp/hemmasian-backend-1.2.0.tar /tmp/hemmasian-frontend-1.1.0.tar ubuntu@$NODE:/tmp/
  ssh ubuntu@$NODE \
    'sudo k3s ctr images import /tmp/hemmasian-backend-1.2.0.tar && sudo k3s ctr images import /tmp/hemmasian-frontend-1.1.0.tar'
done
```

Verify the images without printing credentials:

```bash
for NODE in $CONTROL_PLANE $WORKER; do
  ssh ubuntu@$NODE "sudo k3s ctr images list | grep -E 'hemmasian-(backend|frontend)'"
done
```

## 5. Copy deployment files

```bash
ssh ubuntu@$CONTROL_PLANE "mkdir -p $DEPLOY_DIR"
scp -r k8s monitoring ubuntu@$CONTROL_PLANE:$DEPLOY_DIR/
```

## 6. Deploy and verify the Backend first

Generate new secrets for a clean database. If old database files are restored, reuse the original Fernet key or stored cluster tokens cannot be decrypted.

```bash
export DJANGO_SECRET_KEY="$(openssl rand -hex 32)"
export FERNET_KEY="$(.venv/bin/python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')"

ssh ubuntu@$CONTROL_PLANE \
  'sudo k3s kubectl create namespace hemmasian --dry-run=client -o yaml | sudo k3s kubectl apply -f -'

ssh ubuntu@$CONTROL_PLANE \
  "sudo k3s kubectl -n hemmasian create secret generic backend-secret \
    --from-literal=DJANGO_SECRET_KEY='$DJANGO_SECRET_KEY' \
    --from-literal=KUBERNETES_TOKEN_ENCRYPTION_KEY='$FERNET_KEY' \
    --dry-run=client -o yaml | sudo k3s kubectl apply -f -"

unset DJANGO_SECRET_KEY FERNET_KEY

ssh ubuntu@$CONTROL_PLANE \
  "cd $DEPLOY_DIR && sudo k3s kubectl apply --dry-run=server -f k8s/backend.yaml"
ssh ubuntu@$CONTROL_PLANE \
  "cd $DEPLOY_DIR && sudo k3s kubectl apply -f k8s/backend.yaml"
ssh ubuntu@$CONTROL_PLANE \
  "cd $DEPLOY_DIR && sudo k3s kubectl apply -f k8s/cluster-api-rbac.yaml"
```

Wait for every required backend component:

```bash
for DEPLOYMENT in redis backend celery-worker celery-beat; do
  ssh ubuntu@$CONTROL_PLANE \
    "sudo k3s kubectl rollout status deployment/$DEPLOYMENT -n hemmasian --timeout=180s"
done

ssh ubuntu@$CONTROL_PLANE 'sudo k3s kubectl get pods,pvc,svc -n hemmasian -o wide'
```

Create the Django administrator interactively:

```bash
ssh -t ubuntu@$CONTROL_PLANE \
  'sudo k3s kubectl exec -it -n hemmasian deployment/backend -c backend -- python manage.py createsuperuser'
```

Register this same cluster through the API. The internal service address is reachable from the Backend pod and the mounted K3s CA verifies it:

```bash
export K8S_TOKEN="$(ssh ubuntu@$CONTROL_PLANE 'sudo k3s kubectl -n hemmasian create token cluster-api --duration=8760h')"

ssh -L 8001:127.0.0.1:8001 ubuntu@$CONTROL_PLANE \
  'sudo k3s kubectl port-forward -n hemmasian service/backend 8001:8000' &
PORT_FORWARD_PID=$!

curl -u 'admin:REPLACE_WITH_PASSWORD' \
  -X POST http://127.0.0.1:8001/api/clusters/ \
  -H 'Content-Type: application/json' \
  --data "$(jq -n --arg token "$K8S_TOKEN" \
    '{name:"hemmasian",addr:"https://kubernetes.default.svc:443",token:$token}')"

unset K8S_TOKEN
curl -u 'admin:REPLACE_WITH_PASSWORD' \
  http://127.0.0.1:8001/api/clusters/1/connection/

kill $PORT_FORWARD_PID
```

The expected connection response contains `"connected": true` and the K3s version.

## 7. Deploy and verify the Frontend

```bash
ssh ubuntu@$CONTROL_PLANE \
  "cd $DEPLOY_DIR && sudo k3s kubectl apply --dry-run=server -f k8s/frontend.yaml"
ssh ubuntu@$CONTROL_PLANE \
  "cd $DEPLOY_DIR && sudo k3s kubectl apply -f k8s/frontend.yaml"
ssh ubuntu@$CONTROL_PLANE \
  'sudo k3s kubectl rollout status deployment/frontend -n hemmasian --timeout=120s'
```

Add local hostnames on the Mac:

```text
94.101.187.131 hemmasian grafana.hemmasian
```

Then open `http://hemmasian` and sign in with the Django administrator.

## 8. Install only the VictoriaMetrics Operator with Helm

Use a local SSH tunnel so the cluster admin kubeconfig never needs a public API address. Keep the first command running in a dedicated terminal:

```bash
ssh -N -L 6443:127.0.0.1:6443 ubuntu@$CONTROL_PLANE
```

In a second terminal:

```bash
ssh ubuntu@$CONTROL_PLANE 'sudo cat /etc/rancher/k3s/k3s.yaml' > /tmp/hemmasian-kubeconfig.yaml
chmod 600 /tmp/hemmasian-kubeconfig.yaml
export KUBECONFIG=/tmp/hemmasian-kubeconfig.yaml

kubectl get nodes
helm repo add vm https://victoriametrics.github.io/helm-charts/
helm repo update
helm upgrade --install vm-operator vm/victoria-metrics-operator \
  --version 0.67.3 \
  --namespace monitoring-hamamooz-task \
  --create-namespace \
  --set resources.requests.cpu=25m \
  --set resources.requests.memory=64Mi \
  --set resources.limits.cpu=200m \
  --set resources.limits.memory=192Mi \
  --set-string 'nodeSelector.hamamooz\.io/workload-node=true'
```

Watch the CRDs in another terminal during the first installation:

```bash
KUBECONFIG=/tmp/hemmasian-kubeconfig.yaml kubectl get crd --watch
```

## 9. Deploy the simple pipeline, then secure Grafana access

```bash
kubectl apply --dry-run=server -f k8s/victoriametrics/01-simple-pipeline.yaml
kubectl apply -f k8s/victoriametrics/01-simple-pipeline.yaml
kubectl apply -f k8s/service-monitors.yaml

kubectl -n monitoring-hamamooz-task get vmsingle,vmagent,vmservicescrape
kubectl -n monitoring-hamamooz-task get pods,svc,pvc -o wide
```

First verify the simple path directly. Keep each port-forward running in its own terminal:

```bash
kubectl -n monitoring-hamamooz-task port-forward service/vmagent-hamamooz 8429:8429
```

```bash
curl -s http://127.0.0.1:8429/api/v1/targets | jq '.data.activeTargets[] | {health, scrapeUrl, lastError}'
```

```bash
kubectl -n monitoring-hamamooz-task port-forward service/vmsingle-hamamooz 8428:8428
```

```bash
curl -G http://127.0.0.1:8428/api/v1/query \
  --data-urlencode 'query=sum by(resource,operation,outcome)(hamamooz_kubernetes_operations_total)'
```

After the simple path works, add authenticated read access. The operator creates the `vmuser-hamamooz-reader` Secret used by Grafana:

```bash
kubectl apply --dry-run=server -f k8s/victoriametrics/02-secure-access.yaml
kubectl apply -f k8s/victoriametrics/02-secure-access.yaml
kubectl -n monitoring-hamamooz-task rollout status deployment/vmauth-hamamooz --timeout=180s
kubectl -n monitoring-hamamooz-task get vmauth,vmuser,secret
```

Provision Grafana only after that Secret exists:

```bash

kubectl -n monitoring-hamamooz-task create configmap grafana-dashboards \
  --from-file=hamamooz-task-metrics.json=monitoring/grafana/dashboards/hamamooz-task-metrics.json \
  --dry-run=client -o yaml | kubectl apply -f -

read -s "GRAFANA_PASSWORD?Grafana admin password: "
echo
kubectl -n monitoring-hamamooz-task create secret generic grafana-admin \
  --from-literal=username=admin \
  --from-literal=password="$GRAFANA_PASSWORD" \
  --dry-run=client -o yaml | kubectl apply -f -
unset GRAFANA_PASSWORD

kubectl apply --dry-run=server -f k8s/grafana.yaml
kubectl apply -f k8s/grafana.yaml
```

Wait and inspect:

```bash
kubectl -n monitoring-hamamooz-task rollout status deployment/grafana --timeout=180s
kubectl -n monitoring-hamamooz-task get pods,svc,pvc -o wide
```

Open `http://grafana.hemmasian` and select **HamAmooz Task Metrics**. Grafana now queries VMSingle through VMAuth rather than bypassing authentication.

## 10. Prove namespace, App, and metric behavior

```bash
curl -u 'admin:REPLACE_WITH_PASSWORD' \
  -X POST http://hemmasian/api/namespaces/ \
  -H 'Content-Type: application/json' \
  -d '{"cluster_id":1,"name":"deployment-proof"}'

ssh ubuntu@$CONTROL_PLANE \
  'sudo k3s kubectl get namespace deployment-proof'

curl -u 'admin:REPLACE_WITH_PASSWORD' \
  -X POST http://hemmasian/api/apps/ \
  -H 'Content-Type: application/json' \
  -d '{"namespace":REPLACE_WITH_NAMESPACE_ID,"name":"proof-app","image":"nginx:1.27-alpine","replicas":0,"cpu_request":"25m","memory_request":"32Mi"}'

ssh ubuntu@$CONTROL_PLANE \
  'sudo k3s kubectl get deployment proof-app -n deployment-proof'
```

After one 15-second scrape interval, verify all required metric families:

```bash
for METRIC in \
  hamamooz_kubernetes_operations_total \
  hamamooz_kubernetes_operation_duration_seconds_count \
  hamamooz_backup_jobs_total \
  hamamooz_backup_duration_seconds_count \
  hamamooz_backups_in_progress; do
  curl -sG http://127.0.0.1:8428/api/v1/query --data-urlencode "query=$METRIC" | jq '.data.result'
done
```

## 11. Verify authenticated read access

```bash
kubectl -n monitoring-hamamooz-task port-forward service/vmauth-hamamooz 8427:8427
```

In another terminal:

```bash
export VM_READER_USERNAME="$(kubectl -n monitoring-hamamooz-task get secret vmuser-hamamooz-reader -o jsonpath='{.data.username}' | base64 -d)"
export VM_READER_PASSWORD="$(kubectl -n monitoring-hamamooz-task get secret vmuser-hamamooz-reader -o jsonpath='{.data.password}' | base64 -d)"

curl -u "$VM_READER_USERNAME:$VM_READER_PASSWORD" \
  -G http://127.0.0.1:8427/api/v1/query \
  --data-urlencode 'query=hamamooz_backups_in_progress'

unset VM_READER_USERNAME VM_READER_PASSWORD
```

VMSingle remains ClusterIP-only. Do not apply `03-local-nodeport.yaml` to the remote cluster; that file exists only for Docker Grafana to reach a local Minikube VMSingle.

## 12. Final capacity and cleanup check

```bash
kubectl top nodes
kubectl top pods -A --containers
kubectl get pods -A | grep -vE 'Running|Completed'

for NODE in $CONTROL_PLANE $WORKER; do
  ssh ubuntu@$NODE 'sudo k3s crictl rmi --prune'
done
```

Image pruning removes only images unused by current containers. Keep the deployment tar files until all rollouts and rollback checks are complete.
