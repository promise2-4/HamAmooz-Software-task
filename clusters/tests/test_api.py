from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from clusters.models import App, Cluster, Namespace


@override_settings(
    KUBERNETES_TOKEN_ENCRYPTION_KEY="MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA="
)
class ClusterApiTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("tester", password="secret")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.cluster = Cluster(
            name="home-k3s",
            addr="https://192.168.1.10:6443",
        )
        self.cluster.token = "secret-token"
        self.cluster.save()

    def test_cluster_response_never_exposes_token(self):
        response = self.client.get(f"/api/clusters/{self.cluster.pk}/")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("token", response.data)

    def test_token_is_encrypted_at_rest(self):
        self.assertNotIn("secret-token", self.cluster.encrypted_token)
        self.assertEqual(self.cluster.token, "secret-token")

    def test_registers_cluster_and_does_not_echo_token(self):
        response = self.client.post(
            "/api/clusters/",
            {
                "name": "second-k3s",
                "addr": "https://192.168.1.11:6443/",
                "token": "another-secret-token",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertNotIn("token", response.data)
        saved = Cluster.objects.get(name="second-k3s")
        self.assertEqual(saved.addr, "https://192.168.1.11:6443")
        self.assertEqual(saved.token, "another-secret-token")
        self.assertNotIn("another-secret-token", saved.encrypted_token)

    def test_lists_backend_namespaces(self):
        Namespace.objects.create(cluster=self.cluster, name="my-app", status="Active")
        response = self.client.get(f"/api/clusters/{self.cluster.pk}/namespaces/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["name"], "my-app")

    @patch("clusters.views.KubernetesGateway.create_namespace")
    def test_creates_namespace(self, create_namespace):
        create_namespace.return_value = {"name": "my-app", "status": "Active"}
        response = self.client.post(
            f"/api/clusters/{self.cluster.pk}/namespaces/",
            {"name": "my-app"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        create_namespace.assert_called_once_with("my-app")

    def test_rejects_invalid_namespace_name_before_kubernetes_call(self):
        response = self.client.post(
            f"/api/clusters/{self.cluster.pk}/namespaces/",
            {"name": "Invalid_Name"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    @patch("clusters.views.KubernetesGateway.create_namespace")
    def test_namespace_post_persists_backend_record_after_kubernetes_success(self, create_namespace):
        create_namespace.return_value = {"name": "created-ns", "status": "Active"}
        response = self.client.post(
            "/api/namespaces/",
            {"cluster_id": self.cluster.pk, "name": "created-ns"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(Namespace.objects.filter(cluster=self.cluster, name="created-ns").exists())

    @patch("clusters.views.KubernetesGateway.delete_namespace")
    def test_namespace_delete_deletes_backend_record_after_kubernetes_success(self, delete_namespace):
        namespace = Namespace.objects.create(cluster=self.cluster, name="delete-me")
        response = self.client.delete(f"/api/namespaces/{namespace.pk}/")
        self.assertEqual(response.status_code, 204)
        delete_namespace.assert_called_once_with("delete-me")
        self.assertFalse(Namespace.objects.filter(pk=namespace.pk).exists())

    @patch("clusters.views.KubernetesGateway.deployment_status")
    @patch("clusters.views.KubernetesGateway.create_deployment")
    def test_app_post_creates_deployment_and_database_record(self, create_deployment, deployment_status):
        namespace = Namespace.objects.create(cluster=self.cluster, name="app-ns")
        create_deployment.return_value = object()
        deployment_status.return_value = {"ready": True, "ready_replicas": 1, "replicas": 1}
        response = self.client.post(
            "/api/apps/",
            {"namespace": namespace.pk, "name": "web", "image": "nginx:1.27", "replicas": 1},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        create_deployment.assert_called_once()
        self.assertTrue(App.objects.filter(namespace=namespace, name="web").exists())
        self.assertTrue(response.data["ready"])


@override_settings(
    KUBERNETES_TOKEN_ENCRYPTION_KEY="MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA="
)
class AdminAppearanceTests(TestCase):
    def test_admin_does_not_render_theme_toggle(self):
        user = get_user_model().objects.create_superuser(
            "admin", "admin@example.com", "secret"
        )
        self.client.force_login(user)

        response = self.client.get("/admin/clusters/cluster/")

        self.assertEqual(response.status_code, 200)
        self.assertNotContains(response, "theme-toggle")
        self.assertNotContains(response, "Toggle theme")
