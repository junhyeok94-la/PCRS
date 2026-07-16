"""Offline contract tests for PCRS account, wardrobe, and data-lifecycle APIs."""

import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient


sys.path.insert(0, str(Path(__file__).parent))

import main  # noqa: E402
from auth import AuthenticatedUser, require_authenticated_user  # noqa: E402
import db_client  # noqa: E402
from weather_client import add_generic_utci, is_weather_forecast_cache_fresh, parse_forecast_cache_timestamp  # noqa: E402


RECENT_USER = AuthenticatedUser(
    user_id="00000000-0000-0000-0000-000000000001",
    access_token="test-token",
    last_sign_in_at=datetime.now(timezone.utc).isoformat(),
)


class ForecastCacheUnitTests(unittest.TestCase):
    def test_generic_utci_is_stored_for_every_forecast_hour(self):
        forecast = {
            "temperature_2m": [20.0, 21.0],
            "relativehumidity_2m": [50.0, 55.0],
            "windspeed_10m": [1.0, 1.2],
            "shortwave_radiation": [100.0, 200.0],
        }

        enriched = add_generic_utci(forecast)

        self.assertEqual(len(enriched["utci"]), 2)
        self.assertTrue(all(isinstance(value, float) for value in enriched["utci"]))

    def test_cache_timestamp_accepts_postgres_trimmed_fractional_seconds(self):
        parsed = parse_forecast_cache_timestamp("2026-07-16T01:36:59.17201+00:00")
        self.assertEqual(parsed.microsecond, 172010)
        self.assertEqual(parsed.tzinfo, timezone.utc)

    def test_forecast_cache_prefers_a_future_expiry(self):
        self.assertTrue(is_weather_forecast_cache_fresh({
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat(),
        }))
        self.assertFalse(is_weather_forecast_cache_fresh({
            "expires_at": (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat(),
        }))

    @patch("db_client.get_weather_cache_client")
    def test_location_seed_uses_server_only_client(self, mock_client_factory):
        mock_client = mock_client_factory.return_value
        mock_client.table.return_value.upsert.return_value.execute.return_value.data = []

        seeded = db_client.seed_all_locations_into_db()

        self.assertEqual(seeded, len(db_client.SEED_LOCATIONS))
        mock_client.table.assert_called_once_with("location_dimension")
        mock_client.table.return_value.upsert.assert_called_once()

    @patch("db_client.get_weather_cache_client")
    def test_personalized_cache_only_returns_unexpired_result(self, mock_client_factory):
        mock_client = mock_client_factory.return_value
        after_select = mock_client.table.return_value.select.return_value
        after_user = after_select.eq.return_value
        after_location = after_user.eq.return_value
        after_date = after_location.eq.return_value
        after_hour = after_date.eq.return_value
        after_fingerprint = after_hour.eq.return_value
        after_fingerprint.gt.return_value.limit.return_value.execute.return_value.data = [{"result": {"utci_personalized": 21.5}}]

        result = db_client.get_personalized_analysis_cache(
            RECENT_USER.user_id,
            6,
            "2026-07-16",
            3,
            "profile-fingerprint",
        )

        self.assertEqual(result, {"utci_personalized": 21.5})
        mock_client.table.assert_called_once_with("personalized_analysis_cache")
        after_fingerprint.gt.assert_called_once()


class PhaseContractTests(unittest.TestCase):
    def setUp(self):
        main.app.dependency_overrides[require_authenticated_user] = lambda: RECENT_USER
        self.client = TestClient(main.app)

    def tearDown(self):
        main.app.dependency_overrides.clear()

    def test_profile_requires_realistic_birth_year(self):
        response = self.client.patch("/api/v1/me/profile", json={"birth_year": 1900})
        self.assertEqual(response.status_code, 422)

    def test_api_security_headers_are_present(self):
        response = self.client.get("/health")
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")
        self.assertEqual(response.headers["x-frame-options"], "DENY")
        self.assertEqual(response.headers["referrer-policy"], "strict-origin-when-cross-origin")

    def test_public_recommendation_is_rate_limited(self):
        original_limit = main.PUBLIC_RECOMMEND_RATE_LIMIT
        main.PUBLIC_RECOMMEND_RATE_LIMIT = 1
        main._recommendation_requests.clear()
        try:
            first = self.client.post("/api/v1/recommend", json={})
            second = self.client.post("/api/v1/recommend", json={})
            self.assertEqual(first.status_code, 422)
            self.assertEqual(second.status_code, 429)
            self.assertIn("retry-after", second.headers)
        finally:
            main.PUBLIC_RECOMMEND_RATE_LIMIT = original_limit
            main._recommendation_requests.clear()

    def test_public_weather_endpoints_are_rate_limited(self):
        original_limit = main.PUBLIC_RECOMMEND_RATE_LIMIT
        main.PUBLIC_RECOMMEND_RATE_LIMIT = 1
        main._recommendation_requests.clear()
        try:
            first = self.client.get("/api/v1/weather/daily")
            second = self.client.get("/api/v1/weather/daily")
            self.assertEqual(first.status_code, 422)
            self.assertEqual(second.status_code, 429)
            self.assertIn("retry-after", second.headers)
        finally:
            main.PUBLIC_RECOMMEND_RATE_LIMIT = original_limit
            main._recommendation_requests.clear()

    def test_recommendation_hour_must_be_within_forecast_window(self):
        payload = {
            "latitude": 37.5,
            "longitude": 127.0,
            "selected_hour": 168,
            "profile": {"height": 171, "weight": 60, "age": 30, "gender": "female"},
        }
        response = self.client.post("/api/v1/recommend", json=payload)
        self.assertEqual(response.status_code, 422)

    def test_recommendation_rejects_invalid_profile_and_coordinates(self):
        payload = {
            "latitude": 101,
            "longitude": 127.0,
            "profile": {"height": -171, "weight": 60, "age": 30, "gender": "female"},
        }
        response = self.client.post("/api/v1/recommend", json=payload)
        self.assertEqual(response.status_code, 422)

        payload["selected_hour"] = -1
        response = self.client.post("/api/v1/recommend", json=payload)
        self.assertEqual(response.status_code, 422)

    @patch("main.get_authenticated_recommendation", new_callable=AsyncMock)
    def test_recommendation_batch_deduplicates_planned_hours(self, mock_recommendation):
        mock_recommendation.side_effect = [
            {"forecast_time": "2026-07-16T03:00", "utci_personalized": 21.0},
            {"forecast_time": "2026-07-16T05:00", "utci_personalized": 22.0},
        ]
        response = self.client.post(
            "/api/v1/recommendations/batch",
            json={
                "latitude": 37.5,
                "longitude": 127.0,
                "selected_hours": [3, 5, 3],
                "profile": {"height": 171, "weight": 60, "age": 30, "gender": "female"},
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["selected_hour"] for item in response.json()["recommendations"]], [3, 5])
        self.assertEqual(mock_recommendation.await_count, 2)

    @patch("main.get_weather_forecast_data", new_callable=AsyncMock)
    @patch("main.get_all_location_coordinates", return_value=[{"id": 6, "sido": "서울특별시", "sigungu": "영등포구", "latitude": 37.5264, "longitude": 126.8962}])
    def test_daily_and_hourly_forecasts_share_the_same_weather_data(self, _mock_locations, mock_forecast):
        mock_forecast.return_value = {
            "source": "cache",
            "hourly_data": {
                "time": ["2026-07-16T00:00", "2026-07-16T01:00", "2026-07-17T00:00"],
                "temperature_2m": [20.0, 22.0, 18.0],
                "apparent_temperature": [19.0, 21.0, 17.0],
                "relativehumidity_2m": [60.0, 70.0, 80.0],
                "windspeed_10m": [1.0, 2.0, 3.0],
                "precipitation_probability": [10.0, 40.0, 90.0],
                "utci": [19.5, 21.5, 17.5],
            },
        }

        daily = self.client.get("/api/v1/weather/daily?latitude=37.5&longitude=127.0")
        self.assertEqual(daily.status_code, 200)
        self.assertEqual(daily.json()["daily"][0]["temperature_min"], 20.0)
        self.assertEqual(daily.json()["daily"][0]["temperature_max"], 22.0)
        self.assertEqual(daily.json()["daily"][0]["precipitation_probability_max"], 40)

        hourly = self.client.get("/api/v1/weather/hourly?latitude=37.5&longitude=127.0&date=2026-07-17")
        self.assertEqual(hourly.status_code, 200)
        self.assertEqual(hourly.json()["hourly"][0]["time"], "2026-07-17T00:00")
        self.assertEqual(hourly.json()["hourly"][0]["utci"], 17.5)

        invalid_date = self.client.get("/api/v1/weather/hourly?latitude=37.5&longitude=127.0&date=2026-99-99")
        self.assertEqual(invalid_date.status_code, 422)

    @patch("main.get_phase1_profile", return_value={"user_id": RECENT_USER.user_id, "height_cm": 171})
    def test_profile_reads_only_authenticated_user(self, _mock_profile):
        response = self.client.get("/api/v1/me/profile")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["profile"]["user_id"], RECENT_USER.user_id)

    @patch("main.create_wardrobe_item", return_value={"id": "item-1", "name": "바람막이", "category": "outerwear"})
    def test_wardrobe_create_contract(self, _mock_create):
        response = self.client.post("/api/v1/me/wardrobe", json={"name": "바람막이", "category": "outerwear", "subcategory": "바람막이", "material": "폴리에스터", "notes": "얇은 안감", "warmth_level": 1})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["item"]["id"], "item-1")

    @patch("main.update_wardrobe_item", return_value={"id": "item-1", "name": "따뜻한 바람막이", "category": "outerwear", "warmth_level": 2})
    def test_wardrobe_update_contract(self, _mock_update):
        response = self.client.patch("/api/v1/me/wardrobe/item-1", json={"name": "따뜻한 바람막이", "warmth_level": 2})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["item"]["warmth_level"], 2)

    @patch("main.create_user_location", return_value={"id": "location-1", "name": "회사", "latitude": 37.5, "longitude": 127.0, "is_favorite": True})
    def test_saved_location_create_contract(self, _mock_create):
        response = self.client.post("/api/v1/me/locations", json={"name": "회사", "latitude": 37.5, "longitude": 127.0})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["location"]["name"], "회사")

    @patch("main.get_user_locations", return_value=[{"id": "location-1", "name": "회사", "latitude": 37.5, "longitude": 127.0, "is_favorite": True}])
    def test_saved_locations_are_authenticated(self, _mock_locations):
        response = self.client.get("/api/v1/me/locations")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["locations"][0]["id"], "location-1")

    @patch("main.export_user_data", return_value={"profile": {"height_cm": 171}, "wardrobe_items": []})
    def test_data_export_is_json_attachment(self, _mock_export):
        response = self.client.get("/api/v1/me/data-export")
        self.assertEqual(response.status_code, 200)
        self.assertIn("attachment", response.headers["content-disposition"])
        self.assertEqual(response.json()["profile"]["height_cm"], 171)

    @patch("main.request_account_deletion", return_value={"scheduled_delete_at": "2026-08-14T00:00:00Z"})
    @patch("main.get_admin_client", return_value=object())
    def test_deletion_requires_confirmation_and_recent_auth(self, _mock_admin, _mock_request):
        rejected = self.client.post("/api/v1/me/deletion-request", json={"confirmation_phrase": "REMOVE"})
        self.assertEqual(rejected.status_code, 422)
        accepted = self.client.post("/api/v1/me/deletion-request", json={"confirmation_phrase": "DELETE"})
        self.assertEqual(accepted.status_code, 202)

    @patch("main.get_recommendation_feedback_warmth_bias", return_value=1.0)
    @patch("main.get_wardrobe_items", return_value=[{"name": "세탁 중 패딩", "category": "outerwear", "warmth_level": 2, "is_in_laundry": True}, {"name": "보유 패딩", "category": "outerwear", "warmth_level": 2, "is_favorite": True, "is_in_laundry": False}])
    @patch("main.get_recommendation", new_callable=AsyncMock)
    def test_authenticated_recommendation_prioritizes_wardrobe(self, mock_recommendation, _mock_wardrobe, _mock_bias):
        mock_recommendation.return_value = {
            "utci_personalized": 4.0,
            "recommendations": {"clothing": ["일반 아우터"], "activity": "활동", "hydration": "수분"},
        }
        response = self.client.post(
            "/api/v1/recommendations",
            json={
                "latitude": 37.5,
                "longitude": 127.0,
                "profile": {"height": 171, "weight": 60, "age": 30, "gender": "female", "environment": "outdoor", "activity_level": "walking"},
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["recommendations"]["clothing"][0], "내 옷장: 보유 패딩")
        self.assertNotIn("세탁 중 패딩", response.json()["recommendations"]["clothing"])
        self.assertEqual(response.json()["personalization"]["feedback_warmth_bias"], 1.0)

    @patch("main.get_personalized_analysis_cache", return_value={"utci_personalized": 21.5, "recommendations": {"clothing": []}})
    @patch("main.get_all_location_coordinates", return_value=[{"id": 6, "sido": "서울특별시", "sigungu": "영등포구", "latitude": 37.5264, "longitude": 126.8962}])
    @patch("main.get_recommendation", new_callable=AsyncMock)
    def test_authenticated_recommendation_uses_valid_personal_cache(self, mock_recommendation, _mock_locations, _mock_cache):
        response = self.client.post(
            "/api/v1/recommendations",
            json={
                "latitude": 37.5,
                "longitude": 127.0,
                "selected_hour": 3,
                "profile": {"height": 171, "weight": 60, "age": 30, "gender": "female"},
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["cache_status"], "hit")
        mock_recommendation.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
