import httpx
import datetime
from typing import Dict, Any, Optional
from db_client import get_weather_forecast_cache, upsert_weather_forecast_cache

API_URL = "https://api.open-meteo.com/v1/forecast"

async def fetch_weather_forecast_from_api(lat: float, lon: float) -> Optional[Dict[str, Any]]:
    """
    Open-Meteo Forecast API를 호출하여 특정 위경도의 24시간 시간별 데이터를 직접 가져옵니다.
    반환항목: temperature_2m, relativehumidity_2m, windspeed_10m, shortwave_radiation (7일치)
    """
    params = {
        "latitude": str(lat),
        "longitude": str(lon),
        "hourly": "temperature_2m,relativehumidity_2m,windspeed_10m,shortwave_radiation",
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

async def get_weather_forecast_data(location_id: int, lat: float, lon: float) -> Dict[str, Any]:
    """
    캐싱 메커니즘을 적용한 7일치/24시간 예보 데이터 조회 메인 함수입니다.
    1. 오늘 날짜로 DB 캐시 조회
    2. Cache Hit 판정 (생성된 지 1시간 이내)
    3. Cache Miss 시 Open-Meteo API를 직접 호출하고 DB 캐시 갱신
    """
    today_str = (datetime.datetime.utcnow() + datetime.timedelta(hours=9)).strftime("%Y-%m-%d")
    
    # 1. DB 캐시 조회
    cache = None
    try:
        cache = get_weather_forecast_cache(location_id, today_str)
    except Exception as e:
        print(f"⚠️ Forecast Cache query failed: {e}")
        
    if cache:
        try:
            created_str = cache["updated_at"].replace("Z", "+00:00")
            created_at = datetime.datetime.fromisoformat(created_str)
            utc_now = datetime.datetime.now(created_at.tzinfo)
            # 1시간 이내이면 Cache Hit
            if utc_now - created_at < datetime.timedelta(hours=1):
                print("🚀 Cache Hit: Using forecast data from Supabase weather_forecast_cache.")
                return {
                    "hourly_data": cache["hourly_data"],
                    "source": "cache"
                }
        except Exception as e:
            print(f"⚠️ Cache expiry check error: {e}")
            
    # 2. Cache Miss: Open-Meteo API 직접 호출
    print("🔮 Cache Miss: Fetching live weather forecast from Open-Meteo.")
    live_data = await fetch_weather_forecast_from_api(lat, lon)
    
    if live_data:
        try:
            # DB 캐시 갱신
            upsert_weather_forecast_cache(
                location_id=location_id,
                date_str=today_str,
                hourly_data=live_data
            )
        except Exception as e:
            print(f"⚠️ Failed to cache forecast data: {e}")
            
        return {
            "hourly_data": live_data,
            "source": "api"
        }
        
    # 3. Fallback: API 에러 시 기존 만료 캐시 강제 반환
    if cache:
        print("⚠️ Fallback: Open-Meteo failed. Returning expired cache data.")
        return {
            "hourly_data": cache["hourly_data"],
            "source": "expired_cache"
        }
        
    # 4. 최종 Fallback (가짜/더미 예보 배열 생성 - 7일(168시간)치)
    print("⚠️ Fallback: Open-Meteo & cache both failed. Returning default fallback forecast.")
    hours_count = 168
    dummy_hourly = {
        "time": [(datetime.datetime.now() + datetime.timedelta(hours=i)).strftime("%Y-%m-%dT%H:00") for i in range(hours_count)],
        "temperature_2m": [25.0 + 5.0 * (1.0 - (i % 24 - 14)**2 / 100.0) for i in range(hours_count)], # 낮 기온 높고 밤 낮음
        "relativehumidity_2m": [70.0 - 15.0 * (1.0 - (i % 24 - 14)**2 / 100.0) for i in range(hours_count)],
        "windspeed_10m": [1.5 + 0.5 * (i % 3) for i in range(hours_count)],
        "shortwave_radiation": [max(0.0, 800.0 * (1.0 - (i % 24 - 12)**2 / 36.0)) for i in range(hours_count)] # 해 뜰때만 일사량 발생
    }
    return {
        "hourly_data": dummy_hourly,
        "source": "fallback_mock"
    }
