import base64
import binascii
import shlex
from dataclasses import dataclass
from pathlib import PurePosixPath

from django.conf import settings
from kubernetes import client
from kubernetes.client.exceptions import ApiException
from kubernetes.stream import stream

from config.metrics import observe_kubernetes_operation

from .models import Cluster


KUBERNETES_REQUEST_TIMEOUT = (3, 7)


@dataclass(frozen=True)
class KubernetesGateway:
    cluster: Cluster

    def _api(self):
        configuration = client.Configuration()
        configuration.host = self.cluster.addr
        configuration.api_key = {"authorization": self.cluster.token}
        configuration.api_key_prefix = {"authorization": "Bearer"}
        configuration.verify_ssl = settings.KUBERNETES_VERIFY_SSL
        return client.CoreV1Api(client.ApiClient(configuration))

    def _api_client(self):
        configuration = client.Configuration()
        configuration.host = self.cluster.addr
        configuration.api_key = {"authorization": self.cluster.token}
        configuration.api_key_prefix = {"authorization": "Bearer"}
        configuration.verify_ssl = settings.KUBERNETES_VERIFY_SSL
        return client.ApiClient(configuration)

    def _apps_api(self):
        return client.AppsV1Api(self._api_client())

    def connection_status(self):
        with observe_kubernetes_operation("cluster", "list"):
            version = client.VersionApi(self._api_client()).get_code(
                _request_timeout=KUBERNETES_REQUEST_TIMEOUT
            )
        return {"connected": True, "version": version.git_version}

    def list_application_namespaces(self):
        with observe_kubernetes_operation("namespace", "list"):
            namespaces = self._api().list_namespace(
                _request_timeout=KUBERNETES_REQUEST_TIMEOUT
            ).items
        return [
            {
                "name": namespace.metadata.name,
                "status": namespace.status.phase,
                "created_at": namespace.metadata.creation_timestamp,
            }
            for namespace in namespaces
            if namespace.metadata.name not in settings.KUBERNETES_PROTECTED_NAMESPACES
            and not namespace.metadata.name.startswith("kube-")
            and namespace.status.phase == "Active"
        ]

    def create_namespace(self, name):
        if name in settings.KUBERNETES_PROTECTED_NAMESPACES or name.startswith("kube-"):
            raise ValueError("This namespace name is reserved for Kubernetes.")

        body = client.V1Namespace(
            metadata=client.V1ObjectMeta(
                name=name,
                labels={"app.kubernetes.io/managed-by": "cluster-api"},
            )
        )
        with observe_kubernetes_operation("namespace", "create"):
            namespace = self._api().create_namespace(
                body=body, _request_timeout=KUBERNETES_REQUEST_TIMEOUT
            )
        return {
            "name": namespace.metadata.name,
            "status": namespace.status.phase,
            "created_at": namespace.metadata.creation_timestamp,
        }

    def delete_namespace(self, name):
        with observe_kubernetes_operation("namespace", "delete"):
            return self._api().delete_namespace(
                name=name, _request_timeout=KUBERNETES_REQUEST_TIMEOUT
            )

    def create_deployment(self, namespace, name, image, replicas=1, cpu_request="", memory_request=""):
        labels = {"app.kubernetes.io/name": name, "app.kubernetes.io/managed-by": "cluster-api"}
        resources = None
        requests = {}
        if cpu_request:
            requests["cpu"] = cpu_request
        if memory_request:
            requests["memory"] = memory_request
        if requests:
            resources = client.V1ResourceRequirements(requests=requests)
        container = client.V1Container(name=name, image=image, resources=resources)
        template = client.V1PodTemplateSpec(
            metadata=client.V1ObjectMeta(labels=labels),
            spec=client.V1PodSpec(containers=[container]),
        )
        body = client.V1Deployment(
            metadata=client.V1ObjectMeta(name=name, labels=labels),
            spec=client.V1DeploymentSpec(
                replicas=replicas,
                selector=client.V1LabelSelector(match_labels=labels),
                template=template,
            ),
        )
        with observe_kubernetes_operation("app", "create"):
            return self._apps_api().create_namespaced_deployment(
                namespace=namespace,
                body=body,
                _request_timeout=KUBERNETES_REQUEST_TIMEOUT,
            )

    def update_deployment(self, namespace, name, image, replicas, cpu_request="", memory_request=""):
        with observe_kubernetes_operation("app", "update"):
            deployment = self._apps_api().read_namespaced_deployment(
                name=name,
                namespace=namespace,
                _request_timeout=KUBERNETES_REQUEST_TIMEOUT,
            )
            deployment.spec.replicas = replicas
            container = deployment.spec.template.spec.containers[0]
            container.image = image
            requests = {}
            if cpu_request:
                requests["cpu"] = cpu_request
            if memory_request:
                requests["memory"] = memory_request
            container.resources = client.V1ResourceRequirements(requests=requests) if requests else None
            return self._apps_api().patch_namespaced_deployment(
                name=name,
                namespace=namespace,
                body=deployment,
                _request_timeout=KUBERNETES_REQUEST_TIMEOUT,
            )

    def delete_deployment(self, namespace, name):
        with observe_kubernetes_operation("app", "delete"):
            return self._apps_api().delete_namespaced_deployment(
                name=name,
                namespace=namespace,
                _request_timeout=KUBERNETES_REQUEST_TIMEOUT,
            )

    def deployment_status(self, namespace, name):
        with observe_kubernetes_operation("app", "list"):
            deployment = self._apps_api().read_namespaced_deployment(
                name=name,
                namespace=namespace,
                _request_timeout=KUBERNETES_REQUEST_TIMEOUT,
            )
        status = deployment.status
        return {
            "ready": (status.ready_replicas or 0) == (deployment.spec.replicas or 0),
            "ready_replicas": status.ready_replicas or 0,
            "replicas": deployment.spec.replicas or 0,
        }

    def archive_app_path(self, namespace, app_name, source_path):
        with observe_kubernetes_operation("app", "list"):
            selector = (
                f"app.kubernetes.io/name={app_name},"
                "app.kubernetes.io/managed-by=cluster-api"
            )
            pods = self._api().list_namespaced_pod(
                namespace=namespace,
                label_selector=selector,
                _request_timeout=KUBERNETES_REQUEST_TIMEOUT,
            ).items
            running_pods = [pod for pod in pods if pod.status.phase == "Running"]
            if not running_pods:
                raise RuntimeError("No running pod was found for this app.")

            path = PurePosixPath(source_path)
            parent = str(path.parent)
            name = path.name
            command = [
                "/bin/sh",
                "-c",
                f"tar -czf - -C {shlex.quote(parent)} {shlex.quote(name)} | base64",
            ]
            encoded_archive = stream(
                self._api().connect_get_namespaced_pod_exec,
                running_pods[0].metadata.name,
                namespace,
                command=command,
                container=app_name,
                stderr=True,
                stdin=False,
                stdout=True,
                tty=False,
            )
        try:
            archive = base64.b64decode("".join(encoded_archive.split()), validate=True)
        except (ValueError, binascii.Error) as exc:
            raise RuntimeError("The pod did not return a valid backup archive.") from exc
        if not archive.startswith(b"\x1f\x8b"):
            raise RuntimeError("The pod did not return a valid gzip archive.")
        return archive


__all__ = ["ApiException", "KubernetesGateway"]
