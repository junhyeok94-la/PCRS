import asyncio
import datetime
import os
import httpx
from typing import Dict, Any, Optional
from db_client import (
    coordinate_cache_key,
    get_coordinate_weather_forecast_cache,
    normalize_forecast_coordinates,
    upsert_coordinate_weather_forecast_cache,
)
from utci_pure import calculate_utci_pure as calc_utci_raw

API_URL = "https://api.open-meteo.com/v1/forecast"
FORECAST_CACHE_TTL_SECONDS = int(os.getenv("FORECAST_CACHE_TTL_SECONDS", "10800"))


def parse_forecast_cache_timestamp(value: str) -> datetime.datetime:
    """Parse PostgREST timestamps on Python versions with strict fractions.

    PostgreSQL can omit trailing zeros in a fractional second (for example,
    ``.17201``). Python 3.10 rejects some of those otherwise-valid ISO 8601
    variants, so normalize the fraction before comparing cache expiry.
    """
    normalized = value.replace("Z", "+00:00")
    try:
        parsed = datetime.datetime.fromisoformat(normalized)
    except ValueError:
        prefix, separator, remainder = normalized.partition(".")
        if not separator:
            raise
        timezone_start = next((index for index, char in enumerate(remainder) if char in "+-"), len(remainder))
        fraction = remainder[:timezone_start]
        timezone_suffix = remainder[timezone_start:]
        if not fraction.isdigit():
            raise
        parsed = datetime.datetime.fromisoformat(
            f"{prefix}.{fraction.ljust(6, '0')[:6]}{timezone_suffix}"
        )
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=datetime.timezone.utc)


def is_weather_forecast_cache_fresh(cache: Optional[Dict[str, Any]]) -> bool:
    """Return whether a cached forecast is still valid without raising."""
    if not cache:
        return False
    try:
        utc_now = datetime.datetime.now(datetime.timezone.utc)
        expires_at = cache.get("expires_at")
        if expires_at:
            return utc_now < parse_forecast_cache_timestamp(expires_at)
        created_at = parse_forecast_cache_timestamp(cache["updated_at"])
        return utc_now - created_at < datetime.timedelta(seconds=FORECAST_CACHE_TTL_SECONDS)
    except (KeyError, TypeError, ValueError):
        return False


def add_generic_utci(hourly_data: Dict[str, Any]) -> Dict[str, Any]:
    """Add generic outdoor UTCI values for every hourly forecast entry."""
    temperatures = hourly_data.get("temperature_2m", [])
    humidities = hourly_data.get("relativehumidity_2m", [])
    wind_speeds = hourly_data.get("windspeed_10m", [])
    radiations = hourly_data.get("shortwave_radiation", [])
    utci_values = []

    for index, temperature in enumerate(temperatures):
        humidity = humidities[index] if index < len(humidities) else 60.0
        wind_speed = wind_speeds[index] if index < len(wind_speeds) else 1.5
        radiation = radiations[index] if index < len(radiations) else 0.0
        mean_radiant_temperature = round(temperature + 0.0014 * radiation, 1)
        try:
            value = calc_utci_raw(
                tdb=temperature,
                tr=mean_radiant_temperature,
                v=wind_speed,
                rh=humidity,
            )
        except Exception:
            value = temperature + (mean_radiant_temperature - temperature) * 0.35 - max(0.0, wind_speed - 0.5) * 2.0
        utci_values.append(round(value, 2))

    hourly_data["utci"] = utci_values
    return hourly_data

async def fetch_weather_forecast_from_api(lat: float, lon: float) -> Optional[Dict[str, Any]]:
    """
    Open-Meteo Forecast API를 호출하여 특정 위경도의 24시간 시간별 데이터를 직접 가져옵니다.
    반환항목: temperature_2m, relativehumidity_2m, windspeed_10m, shortwave_radiation (7일치)
    """
    params = {
        "latitude": str(lat),
        "longitude": str(lon),
        "hourly": "temperature_2m,relativehumidity_2m,windspeed_10m,shortwave_radiation,apparent_temperature,uv_index,precipitation_probability",
        "wind_speed_unit": "ms",
        "timezone": "Asia/Seoul",
        "forecast_days": "7"  # 1차 스펙에 맞춰 7일치 기상 예보 수집
    }
    
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            print(f"📡 Open-Meteo Forecast Fetch: lat={lat}, lon={lon} (7 Days)...")
            response = await client.get(API_URL, params=params)
            
            if response.status_code != 200:
                print(f"❌ Open-Meteo API Error: HTTP {response.status_code}")
                return None
                
            res_json = response.json()
            if "hourly" not in res_json:
                print("❌ Open-Meteo Response missing 'hourly' field.")
                return None
                
            return res_json["hourly"]
            
    except Exception as e:
        print(f"❌ Open-Meteo Fetch Exception: {e}")
        return None

async def fetch_air_quality_from_api(lat: float, lon: float) -> Optional[Dict[str, Any]]:
    """
    Open-Meteo Air Quality API를 호출하여 특정 위경도의 24시간 시간별 대기질(PM10, PM2.5) 데이터를 직접 가져옵니다.
    """
    url = "https://air-quality-api.open-meteo.com/v1/air-quality"
    params = {
        "latitude": str(lat),
        "longitude": str(lon),
        "hourly": "pm10,pm2_5",
        "timezone": "Asia/Seoul",
        "forecast_days": "7"
    }
    
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            print(f"📡 Open-Meteo Air Quality Fetch: lat={lat}, lon={lon} (7 Days)...")
            response = await client.get(url, params=params)
            
            if response.status_code != 200:
                print(f"❌ Open-Meteo Air Quality API Error: HTTP {response.status_code}")
                return None
                
            res_json = response.json()
            if "hourly" not in res_json:
                print("❌ Open-Meteo Air Quality Response missing 'hourly' field.")
                return None
                
            return res_json["hourly"]
            
    except Exception as e:
        print(f"❌ Open-Meteo Air Quality Fetch Exception: {e}")
        return None

async def get_weather_forecast_data(lat: float, lon: float) -> Dict[str, Any]:
    """
    캐싱 메커니즘을 적용한 7일치/24시간 예보 데이터 조회 메인 함수입니다.
    1. 오늘 날짜로 DB 캐시 조회
    2. Cache Hit 판정 (생성된 지 1시간 이내)
    3. Cache Miss 시 Open-Meteo API를 직접 호출하고 DB 캐시 갱신
    """
    today_str = (datetime.datetime.utcnow() + datetime.timedelta(hours=9)).strftime("%Y-%m-%d")
    
    normalized_lat, normalized_lon = normalize_forecast_coordinates(lat, lon)
    cache_key = coordinate_cache_key(normalized_lat, normalized_lon)

    # 1. DB 캐시 조회
    cache = None
    try:
        cache = get_coordinate_weather_forecast_cache(cache_key, today_str)
    except Exception as e:
        print(f"⚠️ Forecast Cache query failed: {e}")
        
    if is_weather_forecast_cache_fresh(cache):
        print("🚀 Cache Hit: Using coordinate weather forecast cache.")
        return {
            "hourly_data": cache["hourly_data"],
            "source": "cache",
            "cache_key": cache_key,
            "latitude": normalized_lat,
            "longitude": normalized_lon,
        }
            
    # 2. Cache Miss: Open-Meteo API 직접 호출
    print("🔮 Cache Miss: Fetching live weather forecast from Open-Meteo.")
    # These independent provider calls used to run serially, which made a cold
    # cache wait for both network round trips before any recommendation could
    # be returned.
    live_data, air_data = await asyncio.gather(
        fetch_weather_forecast_from_api(normalized_lat, normalized_lon),
        fetch_air_quality_from_api(normalized_lat, normalized_lon),
    )
    
    if live_data:
        # 대기질 데이터도 병합해서 가져오기
        if air_data:
            length = len(live_data.get("time", []))
            live_data["pm10"] = air_data.get("pm10", [0.0] * length)
            live_data["pm2_5"] = air_data.get("pm2_5", [0.0] * length)
        else:
            length = len(live_data.get("time", []))
            live_data["pm10"] = [35.0] * length  # fallback default
            live_data["pm2_5"] = [15.0] * length  # fallback default

        live_data = add_generic_utci(live_data)

        try:
            # DB 캐시 갱신
            persisted = upsert_coordinate_weather_forecast_cache(
                cache_key=cache_key,
                latitude=normalized_lat,
                longitude=normalized_lon,
                date_str=today_str,
                hourly_data=live_data
            )
            if persisted is None:
                print("ERROR [coordinate_weather_forecast_cache]: forecast was fetched but was not persisted.")
        except Exception as e:
            print(f"⚠️ Failed to cache forecast data: {e}")
            
        return {
            "hourly_data": live_data,
            "source": "api",
            "cache_key": cache_key,
            "latitude": normalized_lat,
            "longitude": normalized_lon,
        }
        
    # 3. Fallback: API 에러 시 기존 만료 캐시 강제 반환
    if cache:
        print("⚠️ Fallback: Open-Meteo failed. Returning expired cache data.")
        return {
            "hourly_data": cache["hourly_data"],
            "source": "expired_cache",
            "cache_key": cache_key,
            "latitude": normalized_lat,
            "longitude": normalized_lon,
        }
        
    # 4. 최종 Fallback (가짜/더미 예보 배열 생성 - 7일(168시간)치)
    print("⚠️ Fallback: Open-Meteo & cache both failed. Returning default fallback forecast.")
    hours_count = 168
    dummy_hourly = {
        "time": [(datetime.datetime.now() + datetime.timedelta(hours=i)).strftime("%Y-%m-%dT%H:00") for i in range(hours_count)],
        "temperature_2m": [25.0 + 5.0 * (1.0 - (i % 24 - 14)**2 / 100.0) for i in range(hours_count)], # 낮 기온 높고 밤 낮음
        "relativehumidity_2m": [70.0 - 15.0 * (1.0 - (i % 24 - 14)**2 / 100.0) for i in range(hours_count)],
        "windspeed_10m": [1.5 + 0.5 * (i % 3) for i in range(hours_count)],
        "shortwave_radiation": [max(0.0, 800.0 * (1.0 - (i % 24 - 12)**2 / 36.0)) for i in range(hours_count)], # 해 뜰때만 일사량 발생
        "apparent_temperature": [25.0 + 5.0 * (1.0 - (i % 24 - 14)**2 / 100.0) for i in range(hours_count)],
        "uv_index": [max(0.0, 8.0 * (1.0 - (i % 24 - 12)**2 / 36.0)) for i in range(hours_count)],
        "precipitation_probability": [10 * (i % 5) for i in range(hours_count)],
        "pm10": [35.0 + 10.0 * (i % 3) for i in range(hours_count)],
        "pm2_5": [15.0 + 5.0 * (i % 3) for i in range(hours_count)]
    }
    return {
        "hourly_data": dummy_hourly,
        "source": "fallback_mock",
        "cache_key": cache_key,
        "latitude": normalized_lat,
        "longitude": normalized_lon,
    }
