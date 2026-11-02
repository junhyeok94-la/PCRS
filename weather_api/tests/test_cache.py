from datetime import timedelta
from pathlib import Path
import tempfile
import unittest

import httpx
from fastapi.testclient import TestClient

from weather_api.cache import WeatherCacheStore, BudgetExhausted, BudgetUnavailable
from weather_api.kma import KmaClient, ProviderError, normalize
from weather_api.main import create_app
from weather_api.settings import Settings
from weather_api.tests.test_weather import NOW, provider_payload


class PersistentCacheTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "weather.sqlite3"
        self.calls = []
        self.now = NOW
        self.provider_fails = False
        def handler(request):
            self.calls.append(request.url.path)
            return httpx.Response(503) if self.provider_fails else httpx.Response(200, json=provider_payload(request))
        self.transport = httpx.MockTransport(handler)

    def app(self, limit=None):
        return create_app(Settings(service_key="secret", cache_db_path=self.path, daily_request_limit=limit), self.transport, lambda: self.now)

    def query(self, client):
        return client.post("/v1/weather", json={"regionIds": ["1144000000"]})

    def test_restart_reuses_both_components_and_preserves_fetch_time(self):
        with TestClient(self.app()) as client:
            before = self.query(client).json()["locations"][0]
        self.now += timedelta(minutes=5)
        with TestClient(self.app()) as client:
            after = self.query(client).json()["locations"][0]
        self.assertEqual(len(self.calls), 2)
        self.assertEqual(before["forecast"]["fetchedAt"], after["forecast"]["fetchedAt"])
        self.assertEqual(before["current"]["fetchedAt"], after["current"]["fetchedAt"])
        self.assertEqual(before["forecast"]["expiresAt"], NOW.replace(hour=11, minute=10).isoformat())
        self.assertEqual(before["current"]["expiresAt"], NOW.replace(hour=10, minute=10).isoformat())

    def test_same_forecast_run_is_not_fetched_every_ten_minutes(self):
        with TestClient(self.app()) as client:
            self.query(client)
            self.now += timedelta(minutes=30)
            self.query(client)
        self.assertEqual(sum(path.endswith("getVilageFcst") for path in self.calls), 1)
        self.assertEqual(sum(path.endswith("getUltraSrtNcst") for path in self.calls), 2)

    def test_release_boundary_refreshes_only_the_component_with_a_new_issue(self):
        with TestClient(self.app()) as client:
            self.query(client)
            self.now = NOW.replace(hour=11, minute=9)
            self.query(client)
            forecasts = sum(path.endswith("getVilageFcst") for path in self.calls)
            self.now += timedelta(minutes=1)
            result = self.query(client).json()["locations"][0]
        self.assertEqual(forecasts, 1)
        self.assertEqual(sum(path.endswith("getVilageFcst") for path in self.calls), 2)
        self.assertTrue(result["forecast"]["issuedAt"].startswith("2026-11-02T11:00"))

    def test_restart_offline_uses_stale_cache_but_never_forever(self):
        with TestClient(self.app()) as client:
            self.query(client)
        self.provider_fails = True
        self.now = NOW.replace(hour=11, minute=11)
        with TestClient(self.app()) as client:
            result = self.query(client).json()["locations"][0]
            self.assertEqual(result["forecast"]["freshness"], "stale")
            self.assertIsNone(result["current"])
            self.now += timedelta(hours=7)
            self.assertEqual(self.query(client).status_code, 503)

    def test_quota_survives_restart_and_cache_hits_do_not_spend_budget(self):
        with TestClient(self.app(limit=2)) as client:
            self.assertEqual(self.query(client).status_code, 200)
            self.query(client)
        self.now = NOW.replace(hour=11, minute=11)
        with TestClient(self.app(limit=2)) as client:
            result = self.query(client).json()["locations"][0]
        self.assertEqual(len(self.calls), 2)
        self.assertIn("provider_daily_budget_exhausted", [e["code"] for e in result["errors"]])
        self.assertEqual(result["forecast"]["freshness"], "stale")

    def test_request_counter_rolls_over_by_date_and_is_atomic_across_connections(self):
        a, b = WeatherCacheStore(self.path), WeatherCacheStore(self.path)
        try:
            a.reserve(NOW.date(), 1)
            with self.assertRaises(BudgetExhausted): b.reserve(NOW.date(), 1)
            b.reserve((NOW + timedelta(days=1)).date(), 1)
            self.assertEqual(a.attempts(NOW.date()), 1)
            self.assertEqual(a.attempts((NOW + timedelta(days=1)).date()), 1)
        finally:
            a.close(); b.close()

    def test_corrupt_database_does_not_bypass_configured_budget(self):
        self.path.write_bytes(b"not a sqlite database")
        store = WeatherCacheStore(self.path)
        self.assertIsNone(store.load("forecast", 60, 127))
        with self.assertRaises(BudgetUnavailable): store.reserve(NOW.date(), 100)

    def test_concurrent_budget_reservations_do_not_exceed_cap(self):
        from concurrent.futures import ThreadPoolExecutor
        a, b = WeatherCacheStore(self.path), WeatherCacheStore(self.path)
        def reserve(index):
            try:
                (a if index % 2 else b).reserve(NOW.date(), 5)
                return 1
            except BudgetExhausted:
                return 0
        try:
            with ThreadPoolExecutor(max_workers=8) as pool:
                self.assertEqual(sum(pool.map(reserve, range(20))), 5)
            self.assertEqual(a.attempts(NOW.date()), 5)
        finally:
            a.close(); b.close()

    def test_repeated_failures_back_off_progressively(self):
        self.provider_fails = True
        with TestClient(self.app()) as client:
            self.query(client)
            self.assertEqual(len(self.calls), 2)
            self.now += timedelta(seconds=30)
            self.query(client)
            self.assertEqual(len(self.calls), 4)
            self.now += timedelta(seconds=31)
            self.query(client)
            self.assertEqual(len(self.calls), 4)
            self.now += timedelta(seconds=29)
            self.query(client)
            self.assertEqual(len(self.calls), 6)

    def test_same_grid_different_regions_share_one_dataset_fetch(self):
        from weather_api.regions import Regions
        groups = {}
        for region in Regions().items:
            groups.setdefault((region.grid_x, region.grid_y), []).append(region.id)
        identifiers = next(ids[:2] for ids in groups.values() if len(ids) >= 2)
        with TestClient(self.app()) as client:
            result = client.post("/v1/weather", json={"regionIds": identifiers})
            self.assertEqual(result.status_code, 200)
        self.assertEqual(len(self.calls), 2)

    def test_configured_quota_with_broken_storage_is_not_ready_and_makes_no_http_call(self):
        self.path.write_bytes(b"not a database")
        with TestClient(self.app(limit=10)) as client:
            self.assertEqual(client.get("/ready").status_code, 503)
            self.assertEqual(self.query(client).status_code, 503)
        self.assertEqual(self.calls, [])

    def test_payload_byte_budget_evicts_oversized_total(self):
        request = httpx.Request("GET", "https://unit.test/?base_date=20261102&base_time=0800&nx=60&ny=127")
        data = normalize(provider_payload(request)["response"]["body"]["items"]["item"], "forecast", NOW.replace(hour=8), NOW, 600)
        store = WeatherCacheStore(self.path, byte_limit=1)
        try:
            store.save("forecast", 60, 127, data)
            self.assertIsNone(store.load("forecast", 60, 127))
        finally: store.close()

    def test_cache_is_bounded_and_components_and_grids_do_not_mix(self):
        request = httpx.Request("GET", "https://unit.test/?base_date=20261102&base_time=0800&nx=60&ny=127")
        data = normalize(provider_payload(request)["response"]["body"]["items"]["item"], "forecast", NOW.replace(hour=8), NOW, 600)
        store = WeatherCacheStore(self.path, entries=2)
        try:
            for x in (59, 60, 61): store.save("forecast", x, 127, data)
            self.assertIsNone(store.load("forecast", 59, 127))
            self.assertIsNone(store.load("current", 61, 127))
            self.assertIsNotNone(store.load("forecast", 61, 127))
        finally: store.close()


class BudgetPageTests(unittest.IsolatedAsyncioTestCase):
    async def test_every_page_attempt_is_counted_and_limit_stops_before_second_http_call(self):
        calls = []
        def handler(request):
            calls.append(1)
            payload = provider_payload(request)
            body = payload["response"]["body"]
            body["totalCount"] = 1001
            body["items"]["item"] = [body["items"]["item"][0]] * 1000
            return httpx.Response(200, json=payload)
        store = WeatherCacheStore()
        try:
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                provider = KmaClient("secret", client, store, 1, lambda: NOW)
                with self.assertRaisesRegex(ProviderError, "provider_daily_budget_exhausted"):
                    await provider.fetch("forecast", 60, 127, NOW.replace(hour=8))
            self.assertEqual(len(calls), 1)
            self.assertEqual(store.attempts(NOW.date()), 1)
        finally: store.close()

    async def test_failed_transport_attempt_is_counted(self):
        def handler(request): raise httpx.ConnectError("unavailable", request=request)
        store = WeatherCacheStore()
        try:
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                with self.assertRaises(ProviderError):
                    await KmaClient("secret", client, store, 2, lambda: NOW).fetch("current", 60, 127, NOW.replace(hour=9))
            self.assertEqual(store.attempts(NOW.date()), 1)
        finally: store.close()
