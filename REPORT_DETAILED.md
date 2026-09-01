# Detailed Implementation Report

## Scope

The service is a Django REST Framework API for one or more registered Kubernetes clusters. Cluster records identify the API endpoint and contain an encrypted service-account token. Kubernetes operations are isolated behind a small gateway so API views do not construct Kubernetes client objects directly.

## Cluster data model

`Cluster` contains `name`, `addr`, encrypted token data, and timestamps. The token is write-only in the serializer. Encryption uses a Fernet key supplied through `KUBERNETES_TOKEN_ENCRYPTION_KEY`; the key is not stored in the database. This keeps the model simple while avoiding plaintext credentials in SQLite and API responses. Cluster POST deliberately performs no Kubernetes call, as required by the assignment.

## Namespace lifecycle

`Namespace` belongs to a `Cluster` and has a unique `(cluster, name)` constraint. POST validates a Kubernetes DNS label, rejects protected Kubernetes names, creates the namespace through the Kubernetes API, and only then inserts the database record. A Kubernetes conflict becomes HTTP 409; invalid input is HTTP 400; authentication or connectivity failures are reported as HTTP 502.

Namespace GET requires `cluster_id` and reads only backend records. This is an intentional source-of-truth decision: direct kubectl-created namespaces do not appear as application namespaces without an explicit backend record. DELETE locks the database row, deletes the Kubernetes namespace, and deletes the row only after the external operation succeeds. If Kubernetes already reports 404, the backend removes its stale row as a reconciliation-friendly behavior. A second concurrent delete finds no row and receives 404.

## App and Deployment lifecycle

`App` belongs to a tracked namespace and stores `name`, `image`, `replicas`, `cpu_request`, `memory_request`, and timestamps. `(namespace, name)` is unique. POST creates a Kubernetes Deployment with labels owned by the backend, then saves the App record. PATCH updates the Deployment image, replicas, and resource requests before updating the database. DELETE removes the Deployment before deleting the database row.

GET App responses combine database configuration with live Kubernetes status. The response includes readiness and ready replica counts from the current Deployment. This prevents the API from claiming that an App is healthy solely because the database says it should have a particular replica count. If Kubernetes status cannot be read, the configuration is still returned with `ready: false` and a status error.

## Consistency and failure handling

Kubernetes and the database are separate systems, so a normal database transaction cannot atomically commit both. The implementation uses a clear ordering: create or update Kubernetes first, then persist the database state; delete Kubernetes first, then delete the database state. Database locks prevent two delete requests from both treating the same record as active. A production version could add an operation status field and a reconciliation job or queue for crashes between those two steps.

## Throttling and security

Namespace creation is limited to 10 requests per minute per authenticated user scope, and App creation to 20 per minute. The exact values are configurable in Django settings. The API requires authentication, validates DNS-style names, limits replicas to 20, rejects non-HTTPS cluster addresses, encrypts cluster tokens, and never logs or serializes them.

## Verification

The project passes Django system checks and 11 automated tests. Tests cover token confidentiality, cluster registration, database-backed namespace listing, namespace creation and deletion ordering, Kubernetes namespace filtering, App Deployment creation, live readiness responses, invalid input, and admin presentation.

