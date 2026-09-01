from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.test import SimpleTestCase, override_settings

from clusters.kubernetes import KubernetesGateway


@override_settings(
    KUBERNETES_PROTECTED_NAMESPACES={
        "default",
        "kube-system",
        "kube-public",
        "kube-node-lease",
    }
)
class KubernetesGatewayTests(SimpleTestCase):
    @patch("clusters.kubernetes.KubernetesGateway._api")
    def test_list_returns_only_active_non_system_namespaces(self, api_factory):
        def namespace(name, phase):
            return SimpleNamespace(
                metadata=SimpleNamespace(
                    name=name,
                    creation_timestamp="2026-08-16T10:00:00Z",
                ),
                status=SimpleNamespace(phase=phase),
            )

        api = Mock()
        api.list_namespace.return_value.items = [
            namespace("default", "Active"),
            namespace("kube-system", "Active"),
            namespace("my-app", "Active"),
            namespace("old-app", "Terminating"),
        ]
        api_factory.return_value = api
        cluster = SimpleNamespace(addr="https://cluster:6443", token="token")

        result = KubernetesGateway(cluster).list_application_namespaces()

        self.assertEqual([item["name"] for item in result], ["my-app"])
