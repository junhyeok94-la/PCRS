import os
from dotenv import load_dotenv
from supabase import create_client, Client
from typing import Optional, Dict, Any

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in environment variables.")

# Supabase Client Initialization
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def get_region_by_name(sido: str, sigungu: str) -> Optional[Dict[str, Any]]:
    """시도 및 시군구 명칭으로 region_dimension 데이터를 조회합니다."""
    try:
        response = supabase.table("region_dimension") \
            .select("*") \
            .eq("sido", sido) \
            .eq("sigungu", sigungu) \
            .execute()
        
        if response.data and len(response.data) > 0:
            return response.data[0]
        return None
    except Exception as e:
        print(f"Error querying region_dimension: {e}")
        return None

def get_all_regions() -> list:
    """region_dimension 테이블의 전체 sido/sigungu 목록을 반환합니다."""
    try:
        response = supabase.table("region_dimension") \
            .select("sido, sigungu") \
            .order("sido") \
            .order("sigungu") \
            .execute()
        return response.data if response.data else []
    except Exception as e:
        print(f"Error querying region_dimension for list: {e}")
        return []

def get_historical_weather(region_id: int, month: int, hour: int) -> Optional[Dict[str, Any]]:
    """과거 집계 요약 팩트 테이블에서 평균 기상 정보를 조회합니다."""
    try:
        response = supabase.table("historical_weather_fact") \
            .select("*") \
            .eq("region_id", region_id) \
            .eq("month", month) \
            .eq("hour", hour) \
            .execute()
            
        if response.data and len(response.data) > 0:
            return response.data[0]
        return None
    except Exception as e:
        print(f"Error querying historical_weather_fact: {e}")
        return None

def get_weather_cache(region_id: int) -> Optional[Dict[str, Any]]:
    """실시간 기상 캐시 테이블에서 캐시 정보를 조회합니다."""
    try:
        response = supabase.table("weather_cache") \
            .select("*") \
            .eq("region_id", region_id) \
            .execute()
            
        if response.data and len(response.data) > 0:
            return response.data[0]
        return None
    except Exception as e:
        print(f"Error querying weather_cache: {e}")
        return None

def upsert_weather_cache(region_id: int, temp: float, humidity: float, wind_speed: float) -> Optional[Any]:
    """실시간 기상 데이터를 캐시 테이블에 Upsert합니다."""
    try:
        data = {
            "region_id": region_id,
            "temperature": temp,
            "humidity": humidity,
            "wind_speed": wind_speed
        }
        response = supabase.table("weather_cache").upsert(data).execute()
        return response.data
    except Exception as e:
        print(f"Error upserting weather_cache: {e}")
        return None

def insert_user_feedback(user_id: str, feedback_type: str, pmv: float, temp: float, clo: float) -> Optional[Any]:
    """사용자의 추천 피드백 로그를 DB에 적재합니다."""
    try:
        data = {
            "user_id": user_id,
            "feedback_type": feedback_type,
            "pmv_calculated": pmv,
            "temperature": temp,
            "clo_applied": clo
        }
        response = supabase.table("user_feedback_log").insert(data).execute()
        return response.data
    except Exception as e:
        print(f"Error inserting user_feedback_log: {e}")
        return None

def get_user_clo_bias(user_id: str) -> float:
    """
    최근 최대 5건의 피드백 로그를 조회하여 개인화 CLO 편향값(Bias)을 리턴합니다.
    - too_hot: -0.1
    - too_cold: +0.1
    - good: 0.0
    - 합산 값 범위: -0.3 ~ +0.3 (Clamping)
    """
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
            elif ftype == "good":
                pass
                
        # 최대 편향 한도 제한 (-0.3 ~ +0.3)
        clamped_bias = max(-0.3, min(0.3, total_bias))
        return round(clamped_bias, 2)
    except Exception as e:
        print(f"Error calculating user clo bias: {e}")
        return 0.0
