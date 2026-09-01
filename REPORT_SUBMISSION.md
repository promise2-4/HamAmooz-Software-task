# Kubernetes Cluster / Namespace / App API Report

## Result

The backend now exposes authenticated APIs for clusters, namespaces, and applications. A successful application request creates a Kubernetes Deployment in the selected namespace and returns live readiness information. For example:

```http
POST /api/namespace/
Content-Type: application/json

{"cluster_id": 1, "name": "demo-ns"}
```

```json
{"id": 1, "cluster": 1, "name": "demo-ns", "status": "Active"}
```

```http
POST /api/app/
Content-Type: application/json

{"namespace": 1, "name": "web", "image": "nginx:1.27", "replicas": 2}
```

```json
{
  "id": 1,
  "namespace": 1,
  "name": "web",
  "image": "nginx:1.27",
  "replicas": 2,
  "ready": true,
  "ready_replicas": 2
}
```

The corresponding cluster check is:

```text
$ sudo k3s kubectl -n demo-ns get deployment
NAME   READY   UP-TO-DATE   AVAILABLE
web    2/2     2            2
```

These are the expected successful results after the Deployment is accepted by Kubernetes. The automated test suite exercises the same request flow with a mocked Kubernetes API; the live cluster was not changed during development.

## Main decisions

Cluster creation only stores the cluster name, address, and token. It does not connect to Kubernetes. The token is encrypted in the database and is never returned in a response.

Namespace creation first creates the namespace in Kubernetes and then records it in the backend database. Namespace GET uses the database as the source of truth, so namespaces created outside the backend are not accidentally exposed. DELETE removes the Kubernetes resource first and removes the database record after success. Database locks make concurrent deletes deterministic.

The App model stores the application name, namespace, image, replica count, and optional CPU and memory requests. Creating or updating an App maps to a Kubernetes Deployment. App GET reads the current Deployment status from Kubernetes, so readiness is not stale database data.

Namespace and App creation have scoped request throttles. This prevents a user from sending a very large number of resource-creation requests in a short period while leaving normal usage unaffected.
