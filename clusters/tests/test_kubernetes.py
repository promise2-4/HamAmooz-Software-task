from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.test import SimpleTestCase, override_settings

from config.metrics import KUBERNETES_OPERATION_DURATION, KUBERNETES_OPERATIONS
from clusters.kubernetes import KubernetesGateway


def histogram_count(metric):
    return next(
        sample.value
        for family in metric.collect()
        for sample in family.samples
        if sample.name.endswith("_count")
    )


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

        counter = KUBERNETES_OPERATIONS.labels("namespace", "list", "success")
        duration = KUBERNETES_OPERATION_DURATION.labels("namespace", "list", "success")
        counter_before = counter._value.get()
        duration_count_before = histogram_count(duration)

        result = KubernetesGateway(cluster).list_application_namespaces()

        self.assertEqual([item["name"] for item in result], ["my-app"])
        self.assertEqual(counter._value.get(), counter_before + 1)
        self.assertEqual(histogram_count(duration), duration_count_before + 1)

    @patch("clusters.kubernetes.KubernetesGateway._api")
    def test_failed_kubernetes_operation_records_error(self, api_factory):
        api_factory.return_value.list_namespace.side_effect = TimeoutError("timeout")
        cluster = SimpleNamespace(addr="https://cluster:6443", token="token")
        counter = KUBERNETES_OPERATIONS.labels("namespace", "list", "error")
        counter_before = counter._value.get()

        with self.assertRaises(TimeoutError):
            KubernetesGateway(cluster).list_application_namespaces()

        self.assertEqual(counter._value.get(), counter_before + 1)
