import os
from dotenv import load_dotenv
from supabase import create_client, Client
from typing import Optional, Dict, Any, List

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in environment variables.")

# Supabase Client Initialization
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# 전국 거점 위경도 매핑 딕셔너리 (Fallback 및 Seeding용)
REGIONAL_GPS_FALLBACK = {
    "강남구": (37.5172, 127.0473),
    "서초구": (37.4836, 127.0327),
    "송파구": (37.5145, 127.1059),
    "마포구": (37.5638, 126.9084),
    "종로구": (37.5735, 126.9790),
    "영등포구": (37.5264, 126.8962),
}

SEED_LOCATIONS = [
    {"id": 1, "sido": "서울특별시", "sigungu": "강남구", "latitude": 37.5172, "longitude": 127.0473, "nx": 61, "ny": 125, "station_id": 108},
    {"id": 2, "sido": "서울특별시", "sigungu": "서초구", "latitude": 37.4836, "longitude": 127.0327, "nx": 61, "ny": 125, "station_id": 108},
    {"id": 3, "sido": "서울특별시", "sigungu": "송파구", "latitude": 37.5145, "longitude": 127.1059, "nx": 62, "ny": 126, "station_id": 108},
    {"id": 4, "sido": "서울특별시", "sigungu": "마포구", "latitude": 37.5638, "longitude": 126.9084, "nx": 59, "ny": 127, "station_id": 108},
    {"id": 5, "sido": "서울특별시", "sigungu": "종로구", "latitude": 37.5735, "longitude": 126.9790, "nx": 60, "ny": 127, "station_id": 108},
    {"id": 6, "sido": "서울특별시", "sigungu": "영등포구", "latitude": 37.5264, "longitude": 126.8962, "nx": 58, "ny": 126, "station_id": 108},
]

def seed_database_fallback():
    """DB 거점 정보가 비어 있을 때 자동으로 기본 지역 시드 데이터를 주입합니다. (RLS 허용 시)"""
    try:
        data = [
            {"sido": x["sido"], "sigungu": x["sigungu"], "latitude": x["latitude"], "longitude": x["longitude"]}
            for x in SEED_LOCATIONS
        ]
        supabase.table("location_dimension").upsert(data).execute()
        return
    except Exception:
        pass
        
    try:
        data = [
            {"sido": x["sido"], "sigungu": x["sigungu"], "nx": x["nx"], "ny": x["ny"], "station_id": x["station_id"]}
            for x in SEED_LOCATIONS
        ]
        supabase.table("region_dimension").upsert(data).execute()
    except Exception:
        pass

def get_location_by_name(sido: str, sigungu: str) -> Optional[Dict[str, Any]]:
    try:
        response = supabase.table("location_dimension") \
            .select("*") \
            .eq("sido", sido) \
            .eq("sigungu", sigungu) \
            .execute()
        if response.data and len(response.data) > 0:
            return response.data[0]
    except Exception:
        try:
            response = supabase.table("region_dimension") \
                .select("*") \
                .eq("sido", sido) \
                .eq("sigungu", sigungu) \
                .execute()
            if response.data and len(response.data) > 0:
                data = response.data[0]
                g_name = data.get("sigungu", "")
                lat, lon = REGIONAL_GPS_FALLBACK.get(g_name, (37.5264, 126.8962))
                return {
                    "id": data.get("id"),
                    "sido": data.get("sido"),
                    "sigungu": g_name,
                    "latitude": lat,
                    "longitude": lon
                }
        except Exception:
            pass
            
    # 최종 로컬 메모리 매핑
    for loc in SEED_LOCATIONS:
        if loc["sido"] == sido and loc["sigungu"] == sigungu:
            return loc
    return None

def get_all_locations() -> List[Dict[str, Any]]:
    # 데이터가 없을 시 자동 시드 기동 시도
    locs = _get_all_locations_raw()
    if not locs:
        seed_database_fallback()
        locs = _get_all_locations_raw()
    # RLS로 막혀서 여전히 비어있다면 메모리 내 static 시드 리스트 반환 (이중 안전막)
    if not locs:
        return [
            {"sido": x["sido"], "sigungu": x["sigungu"], "latitude": x["latitude"], "longitude": x["longitude"]}
            for x in SEED_LOCATIONS
        ]
    return locs

def _get_all_locations_raw() -> List[Dict[str, Any]]:
    try:
        response = supabase.table("location_dimension") \
            .select("sido, sigungu, latitude, longitude") \
            .order("sido") \
            .order("sigungu") \
            .execute()
        return response.data if response.data else []
    except Exception:
        try:
            response = supabase.table("region_dimension") \
                .select("sido, sigungu") \
                .order("sido") \
                .order("sigungu") \
                .execute()
            result = []
            for r in (response.data or []):
                g_name = r.get("sigungu", "")
                lat, lon = REGIONAL_GPS_FALLBACK.get(g_name, (37.5264, 126.8962))
                result.append({
                    "sido": r["sido"],
                    "sigungu": g_name,
                    "latitude": lat,
                    "longitude": lon
                })
            return result
        except Exception:
            return []

def get_all_location_coordinates() -> List[Dict[str, Any]]:
    locs = _get_all_location_coordinates_raw()
    if not locs:
        seed_database_fallback()
        locs = _get_all_location_coordinates_raw()
    # RLS로 막혀서 여전히 비어있다면 메모리 내 static 시드 리스트 반환 (이중 안전막)
    if not locs:
        return SEED_LOCATIONS
    return locs

def _get_all_location_coordinates_raw() -> List[Dict[str, Any]]:
    try:
        response = supabase.table("location_dimension") \
            .select("id, sido, sigungu, latitude, longitude") \
            .execute()
        if response.data and len(response.data) > 0:
            return response.data
    except Exception:
        try:
            response = supabase.table("region_dimension") \
                .select("id, sido, sigungu") \
                .execute()
            result = []
            for r in (response.data or []):
                g_name = r.get("sigungu", "")
                lat, lon = REGIONAL_GPS_FALLBACK.get(g_name, (37.5264, 126.8962))
                result.append({
                    "id": r["id"],
                    "sido": r["sido"],
                    "sigungu": g_name,
                    "latitude": lat,
                    "longitude": lon
                })
            return result
        except Exception:
            pass
    return []

def get_weather_forecast_cache(location_id: int, date_str: str) -> Optional[Dict[str, Any]]:
    try:
        response = supabase.table("weather_forecast_cache") \
            .select("*") \
            .eq("location_id", location_id) \
            .eq("forecast_date", date_str) \
            .execute()
            
        if response.data and len(response.data) > 0:
            return response.data[0]
    except Exception:
        try:
            response = supabase.table("weather_cache") \
                .select("*") \
                .eq("region_id", location_id) \
                .execute()
            if response.data and len(response.data) > 0:
                cache = response.data[0]
                t = cache.get("temperature", 25.0)
                h = cache.get("humidity", 60.0)
                w = cache.get("wind_speed", 1.5)
                mock_hourly = {
                    "temperature_2m": [t] * 24,
                    "relativehumidity_2m": [h] * 24,
                    "windspeed_10m": [w] * 24,
                    "shortwave_radiation": [0.0] * 24
                }
                return {
                    "location_id": location_id,
                    "forecast_date": date_str,
                    "hourly_data": mock_hourly,
                    "updated_at": cache.get("created_at")
                }
        except Exception:
            pass
    return None

def upsert_weather_forecast_cache(location_id: int, date_str: str, hourly_data: Dict[str, Any]) -> Optional[Any]:
    try:
        data = {
            "location_id": location_id,
            "forecast_date": date_str,
            "hourly_data": hourly_data
        }
        response = supabase.table("weather_forecast_cache").upsert(data).execute()
        return response.data
    except Exception:
        try:
            t = hourly_data.get("temperature_2m", [25.0])[0]
            h = hourly_data.get("relativehumidity_2m", [60.0])[0]
            w = hourly_data.get("windspeed_10m", [1.5])[0]
            data_old = {
                "region_id": location_id,
                "temperature": t,
                "humidity": h,
                "wind_speed": w
            }
            response = supabase.table("weather_cache").upsert(data_old).execute()
            return response.data
        except Exception:
            return None

def insert_user_feedback(user_id: str, feedback_type: str, utci: float, temp: float, clo: float) -> Optional[Any]:
    try:
        data = {
            "user_id": user_id,
            "feedback_type": feedback_type,
            "utci_calculated": utci,
            "temperature": temp,
            "clo_applied": clo
        }
        response = supabase.table("user_feedback_log").insert(data).execute()
        return response.data
    except Exception:
        try:
            data_old = {
                "user_id": user_id,
                "feedback_type": feedback_type,
                "pmv_calculated": utci,
                "temperature": temp,
                "clo_applied": clo
            }
            response = supabase.table("user_feedback_log").insert(data_old).execute()
            return response.data
        except Exception:
            return None

def get_user_clo_bias(user_id: str) -> float:
    try:
        response = supabase.table("user_feedback_log") \
            .select("feedback_type") \
            .eq("user_id", user_id) \
            .order("created_at", desc=True) \
            .limit(5) \
            .execute()
        
        if not response.data:
            return 0.0
        
        total_bias = 0.0
        for log in response.data:
            ftype = log.get("feedback_type")
            if ftype == "too_hot":
                total_bias -= 0.1
            elif ftype == "too_cold":
                total_bias += 0.1
                
        return round(max(-0.3, min(0.3, total_bias)), 2)
    except Exception:
        return 0.0

# 로컬 메모리 프로필 백업 저장소 (RLS 및 테이블 미존재 대비)
LOCAL_USER_PROFILES = {}

def get_user_profile(user_id: str) -> Optional[Dict[str, Any]]:
    """Supabase DB 또는 로컬 폴백 사전에서 유저 프로필 정보를 조회합니다."""
    try:
        response = supabase.table("user_profile") \
            .select("*") \
            .eq("user_id", user_id) \
            .execute()
        if response.data and len(response.data) > 0:
            return response.data[0]
    except Exception as e:
        print(f"Debug [get_user_profile fallback]: {e}")
        
    return LOCAL_USER_PROFILES.get(user_id)

def upsert_user_profile(user_id: str, profile_data: dict) -> Optional[Any]:
    """Supabase DB 또는 로컬 폴백 사전에 유저 프로필 정보를 Upsert 합니다."""
    # DB 쓰기 전송용 데이터 정규화
    db_data = {
        "user_id": user_id,
        "height": float(profile_data.get("height", 171.0)),
        "weight": float(profile_data.get("weight", 60.0)),
        "age": int(profile_data.get("age", 30)),
        "body_fat": float(profile_data["body_fat"]) if profile_data.get("body_fat") is not None else None,
        "gender": profile_data.get("gender", "female"),
        "environment": profile_data.get("environment", "outdoor"),
        "activity_level": profile_data.get("activity_level", "walking")
    }
    
    # 로컬 캐시에 우선 복사
    LOCAL_USER_PROFILES[user_id] = db_data
    
    try:
        response = supabase.table("user_profile").upsert(db_data).execute()
        return response.data
    except Exception as e:
        print(f"Debug [upsert_user_profile fallback]: {e}")
        return db_data

def upsert_historical_weather_fact(
    location_id: int, 
    weather_date: str, 
    hour: int, 
    temp: float, 
    hum: float, 
    wind: float, 
    solar: float, 
    utci: float
) -> Optional[Any]:
    """시간대별 기상 상태 및 산출된 UTCI를 historical_weather_fact 테이블에 Upsert 합니다."""
    db_data = {
        "location_id": location_id,
        "weather_date": weather_date,
        "weather_hour": hour,
        "temperature": float(temp),
        "humidity": float(hum),
        "wind_speed": float(wind),
        "solar_radiation": float(solar),
        "utci": float(utci)
    }
    try:
        response = supabase.table("historical_weather_fact").upsert(db_data).execute()
        return response.data
    except Exception as e:
        print(f"Debug [upsert_historical_weather_fact fallback]: {e}")
        return None


