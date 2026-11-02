import asyncio
from collections import OrderedDict
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Callable

from .kma import KmaClient, ProviderError, latest_issue, next_release, normalize, now_kst, previous_issue
from .cache import WeatherCacheStore
from .models import ComponentError, Dataset, LocationWeather, Region, WeatherEnvelope
from .regions import Regions
from .settings import Settings


@dataclass
class CacheEntry:
    data: Dataset


@dataclass
class FailureEntry:
    until: datetime
    code: str
    issue: datetime
    attempts: int


class WeatherService:
    def __init__(self, settings: Settings, provider: KmaClient, regions: Regions, clock: Callable[[], datetime] = now_kst,
                 store: WeatherCacheStore | None = None):
        self.settings, self.provider, self.regions, self.clock = settings, provider, regions, clock
        self.cache: OrderedDict[tuple, CacheEntry] = OrderedDict()
        self.failures: OrderedDict[tuple, FailureEntry] = OrderedDict()
        self.locks = [asyncio.Lock() for _ in range(64)]
        self.upstream_slots = asyncio.Semaphore(4)
        self.store = store or WeatherCacheStore(settings.cache_db_path, settings.cache_entries)

    def _bounded_put(self, mapping: OrderedDict, key, value):
        mapping[key] = value
        mapping.move_to_end(key)
        while len(mapping) > self.settings.cache_entries:
            mapping.popitem(last=False)

    def _usable(self, data: Dataset, kind: str, now: datetime) -> bool:
        max_age = 5400 if kind == "current" else self.settings.forecast_stale_seconds
        if not timedelta(0) <= now - data.fetched_at <= timedelta(seconds=max_age):
            return False
        if kind == "current":
            return timedelta(0) <= now - data.points[0].valid_at <= timedelta(minutes=90) and now <= data.expires_at + timedelta(seconds=self.settings.current_stale_seconds)
        return any(point.valid_at >= now.replace(minute=0, second=0, microsecond=0) for point in data.points)

    def _failed(self, key: tuple, now: datetime, issue: datetime, code: str):
        prior = self.failures.get(key)
        attempts = prior.attempts + 1 if prior and prior.issue == issue else 1
        seconds = min(900, self.settings.failure_backoff_seconds * 2 ** min(attempts - 1, 6))
        self._bounded_put(self.failures, key, FailureEntry(now + timedelta(seconds=seconds), code, issue, attempts))

    async def component(self, kind: str, region: Region) -> tuple[Dataset | None, str | None]:
        key = kind, region.grid_x, region.grid_y
        async with self.locks[hash(key) % len(self.locks)]:
            now = self.clock()
            expected = latest_issue(kind, now)
            cached = self.cache.get(key)
            if cached is None:
                stored = self.store.load(*key)
                if stored is not None:
                    cached = CacheEntry(stored)
                    self._bounded_put(self.cache, key, cached)
            if cached and self._usable(cached.data, kind, now) and cached.data.expires_at > now and cached.data.issued_at == expected:
                self.cache.move_to_end(key)
                return cached.data, None
            failure = self.failures.get(key)
            if failure and failure.until > now and failure.issue == expected:
                return self._stale(cached, kind, now), failure.code
            try:
                issue, delayed = expected, False
                async with self.upstream_slots:
                    try:
                        items = await self.provider.fetch(kind, region.grid_x, region.grid_y, issue)
                    except ProviderError as error:
                        if error.code != "provider_no_data":
                            raise
                        issue, delayed = previous_issue(kind, issue), True
                        if cached and cached.data.issued_at == issue and self._usable(cached.data, kind, now):
                            code = "provider_latest_run_not_ready"
                            self._failed(key, now, expected, code)
                            return self._stale(cached, kind, now), code
                        items = await self.provider.fetch(kind, region.grid_x, region.grid_y, issue)
                fetched_at = self.clock()
                ttl = max(0, int((next_release(kind, issue) - fetched_at).total_seconds()))
                data = normalize(items, kind, issue, fetched_at, ttl).model_copy(update={"expires_at": next_release(kind, issue)})
                if not self._usable(data, kind, fetched_at):
                    raise ProviderError("provider_no_data")
                self._bounded_put(self.cache, key, CacheEntry(data))
                self.store.save(*key, data)
                if delayed:
                    code = "provider_latest_run_not_ready"
                    self._failed(key, fetched_at, expected, code)
                    return data.model_copy(update={"freshness": "stale"}), code
                self.failures.pop(key, None)
                return data, None
            except ProviderError as error:
                now = self.clock()
                self._failed(key, now, expected, error.code)
                return self._stale(cached, kind, now), error.code

    def _stale(self, cached: CacheEntry | None, kind: str, now: datetime) -> Dataset | None:
        if cached and self._usable(cached.data, kind, now):
            return cached.data.model_copy(update={"freshness": "stale"})
        return None

    async def one_location(self, region: Region, hours: int) -> LocationWeather:
        (forecast, forecast_error), (current, current_error) = await asyncio.gather(
            self.component("forecast", region), self.component("current", region),
        )
        if forecast:
            now = self.clock()
            start = now.replace(minute=0, second=0, microsecond=0)
            end = start + timedelta(hours=hours)
            points = [point for point in forecast.points if start <= point.valid_at < end]
            forecast = forecast.model_copy(update={"points": points}) if points else None
            if not points:
                forecast_error = "provider_no_data"
        errors = [ComponentError(component=component, code=code) for component, code in
                  (("forecast", forecast_error), ("current", current_error)) if code]
        status = "unavailable" if not forecast and not current else "partial" if not forecast or not current or errors else "available"
        return LocationWeather(location=region, status=status, forecast=forecast, current=current, errors=errors)

    async def weather(self, regions: list[Region], hours: int) -> WeatherEnvelope:
        locations = await asyncio.gather(*(self.one_location(region, hours) for region in regions))
        return WeatherEnvelope(generated_at=self.clock(), locations=list(locations))
