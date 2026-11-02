from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class Model(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Region(Model):
    id: str
    name: str
    level: int
    grid_x: int
    grid_y: int
    latitude: float
    longitude: float


class RegionSearch(Model):
    regions: list[Region]


class NearbyRegion(Model):
    region: Region
    match_kind: Literal["nearest_representative_point"] = "nearest_representative_point"
    distance_km: float
    requires_confirmation: bool = True


class Amount(Model):
    kind: Literal["none", "exact", "less_than", "range", "at_least", "unknown"]
    value_mm: float | None = None
    lower_bound_mm: float | None = None
    upper_bound_mm: float | None = None
    raw: str | None = None


class WeatherPoint(Model):
    valid_at: datetime
    temperature_c: float | None = None
    humidity_percent: float | None = None
    wind_speed_ms: float | None = None
    wind_direction_degrees: float | None = None
    precipitation_probability_percent: float | None = None
    precipitation_type: str | None = None
    sky: str | None = None
    precipitation: Amount
    precipitation_period_minutes: int = 60


class DailyTemperatures(Model):
    date: str
    minimum_c: float | None = None
    maximum_c: float | None = None


class Dataset(Model):
    kind: Literal["hourly_forecast", "representative_observation"]
    provider: str = "kma_data_go_kr"
    issued_at: datetime
    fetched_at: datetime
    expires_at: datetime
    freshness: Literal["fresh", "stale"] = "fresh"
    points: list[WeatherPoint]
    daily: list[DailyTemperatures] = Field(default_factory=list)


class ComponentError(Model):
    component: Literal["forecast", "current"]
    code: str


class LocationWeather(Model):
    location: Region
    status: Literal["available", "partial", "unavailable"]
    forecast: Dataset | None = None
    current: Dataset | None = None
    errors: list[ComponentError] = Field(default_factory=list)


class WeatherRequest(Model):
    region_ids: list[str] = Field(min_length=1, max_length=2)
    hours: int = Field(default=36, ge=1, le=48)


class WeatherEnvelope(Model):
    schema_version: str = "1.0"
    timezone: str = "Asia/Seoul"
    is_sample: bool = False
    generated_at: datetime
    attribution: str = "기상청 단기예보·초단기실황 / 공공누리 제1유형 / 앱 표시용으로 정규화"
    locations: list[LocationWeather]
