import asyncio
from datetime import datetime, timedelta, timezone
import json
import unittest

from fastapi.testclient import TestClient
import httpx

from weather_api.kma import KST, KmaClient, ProviderError, latest_issue, normalize, precipitation
from weather_api.main import create_app
from weather_api.regions import Regions
from weather_api.service import WeatherService
from weather_api.settings import Settings

NOW = datetime(2026, 11, 2, 10, 0, tzinfo=KST)


def provider_payload(request: httpx.Request, *, omit_current=False) -> dict:
    params = request.url.params
    issue = datetime.strptime(params["base_date"] + params["base_time"], "%Y%m%d%H%M").replace(tzinfo=KST)
    current = request.url.path.endswith("getUltraSrtNcst")
    if current and omit_current:
        return {"response": {"header": {"resultCode": "03", "resultMsg": "no data"}}}
    common = {"baseDate": params["base_date"], "baseTime": params["base_time"], "nx": int(params["nx"]), "ny": int(params["ny"])}
    items = []
    if current:
        for category, value in {"T1H": "19", "REH": "60", "WSD": "2", "VEC": "180", "PTY": "0", "RN1": "0"}.items():
            items.append({**common, "category": category, "obsrValue": value})
    else:
        for hour in (10, 11, 12, 13, 14):
            for category, value in {"TMP": "19", "REH": "60", "WSD": "2", "VEC": "180", "PTY": "0", "PCP": "1mm 미만", "POP": "20", "SKY": "3"}.items():
                items.append({**common, "category": category, "fcstDate": "20261102", "fcstTime": f"{hour:02d}00", "fcstValue": value})
    return {"response": {"header": {"resultCode": "00", "resultMsg": "NORMAL_SERVICE"},
                         "body": {"totalCount": len(items), "items": {"item": items}}}}


class ParsingTests(unittest.TestCase):
    def test_release_boundary_and_midnight(self):
        self.assertEqual(latest_issue("forecast", NOW.replace(hour=2, minute=9)), NOW.replace(day=1, hour=23))
        self.assertEqual(latest_issue("forecast", NOW.replace(hour=2, minute=10)), NOW.replace(hour=2))
        self.assertEqual(latest_issue("current", NOW.replace(hour=0, minute=9)), NOW.replace(day=1, hour=23))

    def test_utc_is_converted_to_korea(self):
        self.assertEqual(latest_issue("forecast", datetime(2026, 11, 1, 17, 10, tzinfo=timezone.utc)), NOW.replace(hour=2))

    def test_missing_rain_is_not_zero(self):
        self.assertEqual(precipitation(None, present=False).kind, "unknown")
        self.assertIsNone(precipitation(None, present=False).value_mm)
        self.assertEqual(precipitation(None, present=True).kind, "none")

    def test_rain_categories_are_preserved(self):
        for raw, kind in [("강수없음", "none"), ("0", "none"), ("1mm 미만", "less_than"),
                          ("0.5", "less_than"), ("6.2mm", "exact"), ("30.0~50.0mm", "range"),
                          ("30", "range"), ("50.0mm 이상", "at_least"), ("-999", "unknown")]:
            with self.subTest(raw=raw):
                self.assertEqual(precipitation(raw, present=True).kind, kind)
        self.assertEqual(precipitation("1mm 미만", present=True).upper_bound_mm, 1)
        self.assertIsNone(precipitation("1mm 미만", present=True).value_mm)

    def test_observation_is_not_a_clear_sky_forecast(self):
        items = [{"baseDate": "20261102", "baseTime": "0900", "category": "T1H", "obsrValue": "0"}]
        data = normalize(items, "current", NOW.replace(hour=9), NOW, 300)
        self.assertEqual(data.kind, "representative_observation")
        self.assertEqual(data.points[0].temperature_c, 0)
        self.assertIsNone(data.points[0].humidity_percent)
        self.assertIsNone(data.points[0].sky)
        self.assertEqual(data.points[0].precipitation.kind, "unknown")

    def test_measured_rain_is_not_reclassified_as_a_forecast_bucket(self):
        measured = precipitation("0.5", present=True, quantized=False)
        forecast = precipitation("0.5", present=True)
        self.assertEqual(measured.kind, "exact")
        self.assertEqual(measured.value_mm, 0.5)
        self.assertEqual(forecast.kind, "less_than")
        self.assertEqual(precipitation("55", present=True, quantized=False).value_mm, 55)

    def test_invalid_temperatures_do_not_create_a_forecast(self):
        items = [{"fcstDate": "20261102", "fcstTime": "1000", "category": "TMP", "fcstValue": "-999"}]
        with self.assertRaises(ProviderError):
            normalize(items, "forecast", NOW.replace(hour=8), NOW, 600)

    def test_extended_qualitative_horizon_is_not_numeric_hourly_weather(self):
        items = [{"fcstDate": "20261106", "fcstTime": "1000", "category": "TMP", "fcstValue": "19"}]
        with self.assertRaises(ProviderError):
            normalize(items, "forecast", NOW.replace(hour=8), NOW, 600)

    def test_daily_minimum_is_not_inferred_from_remaining_hours(self):
        items = [{"fcstDate": "20261102", "fcstTime": "1000", "category": "TMP", "fcstValue": "19"},
                 {"fcstDate": "20261102", "fcstTime": "1500", "category": "TMX", "fcstValue": "23"}]
        data = normalize(items, "forecast", NOW.replace(hour=8), NOW, 600)
        self.assertEqual(data.daily[0].maximum_c, 23)
        self.assertIsNone(data.daily[0].minimum_c)

    def test_daily_value_before_current_hour_is_preserved_when_supplied(self):
        items = [{"fcstDate": "20261102", "fcstTime": "1000", "category": "TMP", "fcstValue": "19"},
                 {"fcstDate": "20261102", "fcstTime": "0600", "category": "TMN", "fcstValue": "8"}]
        data = normalize(items, "forecast", NOW.replace(hour=8), NOW, 600)
        self.assertEqual(data.daily[0].minimum_c, 8)


class RegionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.regions = Regions()

    def test_official_nationwide_search_and_empty_results(self):
        self.assertGreater(len(self.regions.items), 3000)
        self.assertEqual(self.regions.search("서울 마포구")[0].id, "1144000000")
        self.assertEqual(self.regions.search("서울마포구")[0].id, "1144000000")
        self.assertEqual(self.regions.search("없는지역zz"), [])

    def test_same_names_keep_administrative_path(self):
        names = [region.name for region in self.regions.search("중구", 30)]
        self.assertTrue(any("서울" in name for name in names))
        self.assertTrue(any("부산" in name for name in names))

    def test_current_location_requires_user_confirmation(self):
        nearest = self.regions.nearest(37.5665, 126.9780)
        self.assertIsNotNone(nearest)
        self.assertEqual(nearest[0].level, 3)
        self.assertIsNone(self.regions.nearest(0, 0))


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.provider_fails = False
        self.no_current = False
        self.now = NOW

        def handler(request):
            self.calls.append(request)
            if self.provider_fails:
                return httpx.Response(503, text="secret-key-must-not-leak")
            return httpx.Response(200, json=provider_payload(request, omit_current=self.no_current))
        self.app = create_app(Settings(service_key="secret-key-must-not-leak"), httpx.MockTransport(handler), lambda: self.now)
        self.client = TestClient(self.app)
        self.client.__enter__()
        self.addCleanup(lambda: self.client.__exit__(None, None, None))

    def query(self, identifiers=None, hours=36):
        return self.client.post("/v1/weather", json={"regionIds": identifiers or ["1144000000"], "hours": hours})

    def test_two_region_contract_units_provenance_and_cache(self):
        response = self.query(["1144000000", "1168000000"])
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertFalse(data["isSample"])
        self.assertEqual(data["timezone"], "Asia/Seoul")
        self.assertEqual(len(data["locations"]), 2)
        point = data["locations"][0]["forecast"]["points"][0]
        self.assertEqual(point["windSpeedMs"], 2)
        self.assertEqual(point["precipitation"]["kind"], "less_than")
        self.assertEqual(len(self.calls), 4)
        before = data["locations"][0]["forecast"]["fetchedAt"]
        again = self.query(["1144000000", "1168000000"]).json()
        self.assertEqual(len(self.calls), 4)
        self.assertEqual(before, again["locations"][0]["forecast"]["fetchedAt"])
        self.assertNotIn("secret-key-must-not-leak", response.text)

    def test_one_hour_request_and_repeated_region(self):
        response = self.query(["1144000000", "1144000000"], hours=1)
        self.assertEqual(len(response.json()["locations"]), 1)
        self.assertEqual(len(response.json()["locations"][0]["forecast"]["points"]), 1)
        self.assertEqual(len(self.calls), 2)

    def test_unknown_region_and_input_limits_never_hit_provider(self):
        self.assertEqual(self.query(["bad-id"]).status_code, 422)
        self.assertEqual(self.query(["1", "2", "3"]).status_code, 422)
        self.assertEqual(self.query(hours=0).status_code, 422)
        self.assertEqual(self.query(hours=49).status_code, 422)
        self.assertEqual(len(self.calls), 0)

    def test_total_failure_has_no_invented_weather_and_backoff(self):
        self.provider_fails = True
        response = self.query()
        self.assertEqual(response.status_code, 503)
        self.assertIsNone(response.json()["locations"][0]["forecast"])
        self.assertIsNone(response.json()["locations"][0]["current"])
        self.assertNotIn("secret-key-must-not-leak", response.text)
        calls = len(self.calls)
        self.query()
        self.assertEqual(len(self.calls), calls)

    def test_current_failure_does_not_erase_valid_forecast(self):
        self.no_current = True
        response = self.query()
        self.assertEqual(response.status_code, 200)
        location = response.json()["locations"][0]
        self.assertEqual(location["status"], "partial")
        self.assertIsNone(location["current"])
        self.assertIsNotNone(location["forecast"])

    def test_stale_data_is_labelled_and_eventually_expires(self):
        original = self.query().json()["locations"][0]["forecast"]["fetchedAt"]
        self.provider_fails = True
        self.now += timedelta(minutes=71)
        location = self.query().json()["locations"][0]
        self.assertEqual(location["forecast"]["freshness"], "stale")
        self.assertEqual(location["forecast"]["fetchedAt"], original)
        self.now += timedelta(hours=7)
        response = self.query()
        self.assertEqual(response.status_code, 503)
        self.assertIsNone(response.json()["locations"][0]["forecast"])

    def test_region_search_and_nearby_semantics(self):
        result = self.client.get("/v1/regions", params={"q": "서울 강남구"})
        self.assertEqual(result.json()["regions"][0]["id"], "1168000000")
        result = self.client.get("/v1/regions/nearby", params={"latitude": 37.5665, "longitude": 126.9780})
        self.assertTrue(result.json()["requiresConfirmation"])
        self.assertEqual(result.json()["matchKind"], "nearest_representative_point")
        self.assertEqual(self.client.get("/v1/regions/nearby", params={"latitude": 91, "longitude": 0}).status_code, 422)

    def test_rate_limit_is_local_and_does_not_block_health(self):
        for _ in range(60):
            self.client.get("/v1/regions", params={"q": "마포"})
        self.assertEqual(self.client.get("/v1/regions", params={"q": "마포"}).status_code, 429)
        self.assertEqual(self.client.get("/health").status_code, 200)

    def test_missing_key_is_not_reported_as_success(self):
        with TestClient(create_app(Settings(service_key=""), clock=lambda: NOW)) as client:
            self.assertEqual(client.get("/ready").status_code, 503)
            response = client.post("/v1/weather", json={"regionIds": ["1144000000"]})
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json()["locations"][0]["errors"][0]["code"], "service_not_configured")


class ProviderTests(unittest.IsolatedAsyncioTestCase):
    async def test_xml_gateway_error_is_redacted(self):
        transport = httpx.MockTransport(lambda request: httpx.Response(200, text='<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>30</returnReasonCode><returnAuthMsg>secret</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>'))
        async with httpx.AsyncClient(transport=transport) as client:
            with self.assertRaises(ProviderError) as caught:
                await KmaClient("secret", client).fetch("forecast", 60, 127, NOW.replace(hour=8))
            self.assertEqual(str(caught.exception), "provider_key_rejected")

    async def test_wrong_grid_is_not_cached_as_the_requested_region(self):
        def handler(request):
            payload = provider_payload(request)
            payload["response"]["body"]["items"]["item"][0]["nx"] = 999
            return httpx.Response(200, json=payload)
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            with self.assertRaisesRegex(ProviderError, "provider_invalid_data"):
                await KmaClient("secret", client).fetch("forecast", 60, 127, NOW.replace(hour=8))

    async def test_pagination_is_not_silently_truncated(self):
        calls = []
        def handler(request):
            calls.append(request)
            payload = provider_payload(request)
            body = payload["response"]["body"]
            body["totalCount"] = 1001
            body["items"]["item"] = [body["items"]["item"][0]] * (1000 if request.url.params["pageNo"] == "1" else 1)
            return httpx.Response(200, json=payload)
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            result = await KmaClient("secret", client).fetch("forecast", 60, 127, NOW.replace(hour=8))
        self.assertEqual(len(result), 1001)
        self.assertEqual(len(calls), 2)

    async def test_delayed_latest_run_is_not_claimed_as_fresh(self):
        def handler(request):
            if request.url.params["base_time"] == "0800":
                return httpx.Response(200, json={"response": {"header": {"resultCode": "03"}}})
            return httpx.Response(200, json=provider_payload(request))
        regions = Regions()
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            service = WeatherService(Settings(service_key="secret"), KmaClient("secret", client), regions, lambda: NOW)
            data, error = await service.component("forecast", regions.by_id["1144000000"])
        self.assertEqual(data.freshness, "stale")
        self.assertEqual(data.issued_at.hour, 5)
        self.assertEqual(error, "provider_latest_run_not_ready")

    async def test_concurrent_same_grid_requests_are_coalesced(self):
        calls = []
        async def handler(request):
            calls.append(request)
            await asyncio.sleep(0.01)
            return httpx.Response(200, json=provider_payload(request))
        regions = Regions()
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            service = WeatherService(Settings(service_key="secret"), KmaClient("secret", client), regions, lambda: NOW)
            results = await asyncio.gather(*(service.weather([regions.by_id["1144000000"]], 36) for _ in range(8)))
        self.assertTrue(all(result.locations[0].status == "available" for result in results))
        self.assertEqual(len(calls), 2)


if __name__ == "__main__":
    unittest.main()
