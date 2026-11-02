from datetime import datetime, timedelta, timezone
import math
import re
import xml.etree.ElementTree as ET

import httpx

from .models import Amount, DailyTemperatures, Dataset, WeatherPoint
from .cache import WeatherCacheStore, BudgetExhausted, BudgetUnavailable

KST = timezone(timedelta(hours=9), name="Asia/Seoul")
BASE_URL = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0"
FORECAST_HOURS = (2, 5, 8, 11, 14, 17, 20, 23)


class ProviderError(Exception):
    def __init__(self, code: str):
        self.code = code
        # Never include a request URL, provider message or service key in an exception.
        super().__init__(code)


def now_kst() -> datetime:
    return datetime.now(KST)


def latest_issue(kind: str, now: datetime) -> datetime:
    local = now.astimezone(KST)
    # Official 261019 guide: both endpoints become available 10 minutes after issuance.
    cutoff = local - timedelta(minutes=10)
    if kind == "current":
        return cutoff.replace(minute=0, second=0, microsecond=0)
    candidates = [local.replace(hour=h, minute=0, second=0, microsecond=0) + timedelta(days=d)
                  for d in (-1, 0) for h in FORECAST_HOURS]
    return max(time for time in candidates if time <= cutoff)


def previous_issue(kind: str, issue: datetime) -> datetime:
    return issue - timedelta(hours=1 if kind == "current" else 3)


def next_release(kind: str, issue: datetime) -> datetime:
    return issue + timedelta(hours=1 if kind == "current" else 3, minutes=10)


def number(value, *, minimum: float | None = None, maximum: float | None = None) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(result) or result <= -900:
        return None
    if minimum is not None and result < minimum or maximum is not None and result > maximum:
        return None
    return result


def precipitation(value, *, present: bool, quantized: bool = True) -> Amount:
    if not present:
        return Amount(kind="unknown")
    raw = None if value is None else str(value).strip()
    # Null/dash/zero mean no precipitation only when the provider actually included the category.
    if value is None or raw in ("", "-", "null", "강수없음", "강수 없음", "없음"):
        return Amount(kind="none", value_mm=0, raw=raw)
    text = raw.replace(" ", "")
    values = [float(token) for token in re.findall(r"\d+(?:\.\d+)?", text)]
    if not values or text.startswith("-"):
        return Amount(kind="unknown", raw=raw)
    if "미만" in text:
        return Amount(kind="less_than", upper_bound_mm=values[0], raw=raw)
    if "이상" in text:
        return Amount(kind="at_least", lower_bound_mm=values[0], raw=raw)
    if len(values) == 2 and ("~" in text or "∼" in text or "-" in text):
        return Amount(kind="range", lower_bound_mm=values[0], upper_bound_mm=values[1], raw=raw)
    if len(values) != 1 or re.fullmatch(r"\d+(?:\.\d+)?(?:mm)?", text, re.IGNORECASE) is None:
        return Amount(kind="unknown", raw=raw)
    value_mm = values[0]
    if value_mm == 0:
        return Amount(kind="none", value_mm=0, raw=raw)
    # RN1 in ultra-short observations is a measured number, unlike the forecast display ranges.
    if not quantized:
        return Amount(kind="exact", value_mm=value_mm, raw=raw)
    if value_mm < 1:
        return Amount(kind="less_than", upper_bound_mm=1, raw=raw)
    # Official PCP/RN1 numeric display convention: 30 represents 30–50mm; 50 means >=50mm.
    if value_mm < 30:
        return Amount(kind="exact", value_mm=value_mm, raw=raw)
    if value_mm < 50:
        return Amount(kind="range", lower_bound_mm=30, upper_bound_mm=50, raw=raw)
    return Amount(kind="at_least", lower_bound_mm=50, raw=raw)


def normalize(items: list[dict], kind: str, issue: datetime, fetched_at: datetime, ttl: int) -> Dataset:
    grouped: dict[datetime, dict] = {}
    daily: dict[str, DailyTemperatures] = {}
    for item in items:
        try:
            timestamp = datetime.strptime(
                str(item["baseDate"] if kind == "current" else item["fcstDate"]) +
                str(item["baseTime"] if kind == "current" else item["fcstTime"]).zfill(4), "%Y%m%d%H%M",
            ).replace(tzinfo=KST)
        except (KeyError, ValueError, TypeError):
            raise ProviderError("provider_invalid_data") from None
        if kind == "forecast" and item.get("category") in ("TMN", "TMX"):
            date = timestamp.date().isoformat()
            if fetched_at.date() <= timestamp.date() <= (fetched_at + timedelta(hours=48)).date():
                entry = daily.setdefault(date, DailyTemperatures(date=date))
                value = number(item.get("fcstValue"), minimum=-80, maximum=65)
                if item["category"] == "TMN":
                    entry.minimum_c = value
                else:
                    entry.maximum_c = value
        # Only the near-term hourly horizon is supported. Extended qualitative/3-hour data is not
        # mislabelled as numeric hourly wind/precipitation.
        if kind == "forecast" and not (fetched_at.replace(minute=0, second=0, microsecond=0) <= timestamp <= fetched_at + timedelta(hours=48)):
            continue
        grouped.setdefault(timestamp, {})[item.get("category")] = item.get("obsrValue" if kind == "current" else "fcstValue")
    points = []
    for timestamp, values in sorted(grouped.items()):
        temperature = number(values.get("T1H" if kind == "current" else "TMP"), minimum=-80, maximum=65)
        if temperature is None:
            continue
        amount_category = "RN1" if kind == "current" else "PCP"
        points.append(WeatherPoint(
            valid_at=timestamp, temperature_c=temperature,
            humidity_percent=number(values.get("REH"), minimum=0, maximum=100),
            wind_speed_ms=number(values.get("WSD"), minimum=0, maximum=150),
            wind_direction_degrees=number(values.get("VEC"), minimum=0, maximum=360),
            precipitation_probability_percent=number(values.get("POP"), minimum=0, maximum=100),
            precipitation_type={"0": "none", "1": "rain", "2": "rain_snow", "3": "snow", "4": "shower", "5": "drizzle", "6": "drizzle_snow", "7": "flurries"}.get(str(values.get("PTY"))),
            # Observations do not include SKY: no rain is not evidence of a clear sky.
            sky={"1": "clear", "3": "partly_cloudy", "4": "overcast"}.get(str(values.get("SKY"))),
            precipitation=precipitation(values.get(amount_category), present=amount_category in values, quantized=kind == "forecast"),
        ))
    if not points:
        raise ProviderError("provider_no_data")
    if kind == "current" and any(point.valid_at != issue for point in points):
        raise ProviderError("provider_invalid_data")
    return Dataset(kind="representative_observation" if kind == "current" else "hourly_forecast",
                   issued_at=issue, fetched_at=fetched_at, expires_at=fetched_at + timedelta(seconds=ttl), points=points,
                   daily=[daily[date] for date in sorted(daily)])


class KmaClient:
    def __init__(self, key: str, client: httpx.AsyncClient, store: WeatherCacheStore | None = None,
                 daily_limit: int | None = None, clock=now_kst):
        self._key = key
        self._client = client
        self._store, self._daily_limit, self._clock = store, daily_limit, clock

    async def fetch(self, kind: str, grid_x: int, grid_y: int, issue: datetime) -> list[dict]:
        if not self._key:
            raise ProviderError("service_not_configured")
        endpoint = "getUltraSrtNcst" if kind == "current" else "getVilageFcst"
        result: list[dict] = []
        for page in range(1, 7):
            if self._store:
                try:
                    self._store.reserve(self._clock().astimezone(KST).date(), self._daily_limit)
                except BudgetExhausted:
                    raise ProviderError("provider_daily_budget_exhausted") from None
                except BudgetUnavailable:
                    raise ProviderError("provider_budget_unavailable") from None
            try:
                response = await self._client.get(f"{BASE_URL}/{endpoint}", params={
                    "serviceKey": self._key, "pageNo": page, "numOfRows": 1000, "dataType": "JSON",
                    "base_date": issue.strftime("%Y%m%d"), "base_time": issue.strftime("%H%M"),
                    "nx": grid_x, "ny": grid_y,
                })
            except httpx.HTTPError:
                raise ProviderError("provider_unreachable") from None
            if response.status_code != 200:
                raise ProviderError("provider_rate_limited" if response.status_code == 429 else "provider_http_error")
            try:
                payload = response.json()["response"]
                code = str(payload["header"]["resultCode"]).zfill(2)
            except (ValueError, KeyError, TypeError):
                # The gateway can return XML errors even with dataType=JSON.
                try:
                    code = (ET.fromstring(response.content).findtext(".//returnReasonCode") or "invalid").zfill(2)
                except ET.ParseError:
                    code = "invalid"
                if code == "invalid":
                    raise ProviderError("provider_invalid_response") from None
                payload = {}
            if code != "00":
                error = {"03": "provider_no_data", "20": "provider_access_denied", "21": "provider_access_denied",
                         "22": "provider_rate_limited", "30": "provider_key_rejected", "31": "provider_key_expired",
                         "32": "provider_ip_denied", "33": "provider_key_rejected"}.get(code, "provider_error")
                raise ProviderError(error)
            try:
                body = payload["body"]
                items = body["items"]["item"]
                if isinstance(items, dict):
                    items = [items]
                total = int(body["totalCount"])
                if not isinstance(items, list) or total > 6000:
                    raise ValueError
                for item in items:
                    if int(item["nx"]) != grid_x or int(item["ny"]) != grid_y:
                        raise ValueError
                    actual_issue = str(item["baseDate"]) + str(item["baseTime"]).zfill(4)
                    if actual_issue != issue.strftime("%Y%m%d%H%M"):
                        raise ValueError
                result.extend(items)
            except (ValueError, KeyError, TypeError):
                raise ProviderError("provider_invalid_data") from None
            if len(result) >= total:
                if not result:
                    raise ProviderError("provider_no_data")
                return result
            if not items:
                raise ProviderError("provider_invalid_data")
        raise ProviderError("provider_response_too_large")
