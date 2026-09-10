from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient


class AuthenticationApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_register_creates_active_viewer(self):
        response = self.client.post(
            "/api/auth/register/",
            {
                "username": "newviewer",
                "email": "viewer@example.com",
                "password": "safe-password-42",
                "password_confirm": "safe-password-42",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["role"], "Viewer")
        user = get_user_model().objects.get(username="newviewer")
        self.assertTrue(user.is_active)
        self.assertFalse(user.is_staff)
        self.assertTrue(user.check_password("safe-password-42"))

    def test_register_rejects_duplicate_username_case_insensitively(self):
        get_user_model().objects.create_user("Existing", password="safe-password-42")

        response = self.client.post(
            "/api/auth/register/",
            {
                "username": "existing",
                "password": "safe-password-42",
                "password_confirm": "safe-password-42",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_current_user_returns_role(self):
        user = get_user_model().objects.create_user("viewer", password="safe-password-42")
        self.client.force_authenticate(user)

        response = self.client.get("/api/auth/me/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["username"], "viewer")
        self.assertFalse(response.data["is_staff"])

    def test_viewer_cannot_modify_cluster_resources(self):
        user = get_user_model().objects.create_user("viewer", password="safe-password-42")
        self.client.force_authenticate(user)

        response = self.client.post(
            "/api/clusters/",
            {"name": "blocked", "addr": "https://127.0.0.1:6443", "token": "secret"},
            format="json",
        )

        self.assertEqual(response.status_code, 403)
