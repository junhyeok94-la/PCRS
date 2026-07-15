"""Live Supabase RLS smoke test.

Requires SUPABASE_SERVICE_ROLE_KEY (or SERVICE_ROLE_KEY) in backend/.env.
It creates an email-confirmed temporary user and always deletes it in teardown.
"""

import sys
import unittest
import uuid
from pathlib import Path

from fastapi.testclient import TestClient


sys.path.insert(0, str(Path(__file__).parent))

from db_client import get_admin_client, supabase  # noqa: E402
from main import app  # noqa: E402


class LiveRlsSmokeTests(unittest.TestCase):
    def setUp(self):
        self.admin = get_admin_client()
        if self.admin is None:
            self.skipTest("A server-only service role key is required for live RLS testing.")

        self.email = f"pcrs-integration-{uuid.uuid4().hex}@example.test"
        self.password = f"Pcrs!{uuid.uuid4().hex[:20]}"
        created = self.admin.auth.admin.create_user({
            "email": self.email,
            "password": self.password,
            "email_confirm": True,
        })
        self.user_id = created.user.id
        signed_in = supabase.auth.sign_in_with_password({"email": self.email, "password": self.password})
        self.headers = {"Authorization": f"Bearer {signed_in.session.access_token}"}
        self.client = TestClient(app)

    def tearDown(self):
        if getattr(self, "admin", None) is not None and getattr(self, "user_id", None):
            self.admin.auth.admin.delete_user(self.user_id)

    def test_authenticated_data_lifecycle(self):
        profile = self.client.patch("/api/v1/me/profile", headers=self.headers, json={
            "height_cm": 171,
            "weight_kg": 60,
            "birth_year": 1995,
            "default_activity": "walking",
            "default_environment": "outdoor",
        })
        self.assertEqual(profile.status_code, 200, profile.text)
        self.assertEqual(profile.json()["profile"]["user_id"], self.user_id)

        wardrobe = self.client.post("/api/v1/me/wardrobe", headers=self.headers, json={
            "name": "RLS 테스트 재킷",
            "category": "outerwear",
            "warmth_level": 1,
            "is_favorite": True,
            "seasons": ["spring", "fall"],
            "is_in_laundry": False,
        })
        self.assertEqual(wardrobe.status_code, 201, wardrobe.text)

        location = self.client.post("/api/v1/me/locations", headers=self.headers, json={
            "name": "RLS 테스트 장소",
            "latitude": 37.5264,
            "longitude": 126.8962,
        })
        self.assertEqual(location.status_code, 201, location.text)

        feedback = self.client.post("/api/v1/me/recommendation-feedback", headers=self.headers, json={
            "feedback_type": "comfortable",
            "utci_personalized": 21.5,
            "activity": "walking",
        })
        self.assertEqual(feedback.status_code, 201, feedback.text)

        exported = self.client.get("/api/v1/me/data-export", headers=self.headers)
        self.assertEqual(exported.status_code, 200, exported.text)
        self.assertEqual(exported.json()["profile"]["user_id"], self.user_id)
        self.assertEqual(len(exported.json()["wardrobe_items"]), 1)
        self.assertEqual(len(exported.json()["recommendation_feedback"]), 1)

        deletion = self.client.post("/api/v1/me/deletion-request", headers=self.headers, json={"confirmation_phrase": "DELETE"})
        self.assertEqual(deletion.status_code, 202, deletion.text)
        cancelled = self.client.delete("/api/v1/me/deletion-request", headers=self.headers)
        self.assertEqual(cancelled.status_code, 200, cancelled.text)


if __name__ == "__main__":
    unittest.main()
