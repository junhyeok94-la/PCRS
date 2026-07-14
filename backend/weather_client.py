import os
import httpx
import datetime
from typing import Dict, Any, Optional
from db_client import get_weather_cache, upsert_weather_cache

KMA_APIHUB_API_KEY = os.getenv("KMA_APIHUB_API_KEY")
API_URL = "https://apihub.kma.go.kr/api/typ01/url/kma_sfctm2.php"

def get_realtime_query_times():
    """실시간 조회를 위해 현재 정각(tm2) 및 2시간 전 정각(tm1) 시간을 구합니다."""
    # 대한민국 기준 시간 보정 (+09:00)
    now = datetime.datetime.utcnow() + datetime.timedelta(hours=9)
    
    # 정각 포맷 YYYYMMDDHH00
    tm2 = now.strftime("%Y%m%d%H00")
    tm1 = (now - datetime.timedelta(hours=2)).strftime("%Y%m%d%H00")
    return tm1, tm2

async def fetch_realtime_weather_from_api(stn_id: int) -> Optional[Dict[str, float]]:
    """기상청 API 허브를 통해 특정 관측소의 실시간 현재 기상 데이터(기온, 습도, 풍속)를 직접 가져옵니다."""
    if not KMA_APIHUB_API_KEY or KMA_APIHUB_API_KEY == "your_apihub_key":
        print("⚠️ Warning: KMA_APIHUB_API_KEY is missing or default dummy key.")
        return None

    params = {
        "stn": str(stn_id),
        "disp": "1",  # CSV 포맷 형태로 출력
        "help": "1",  # 컬럼 헤더 포함
        "authKey": KMA_APIHUB_API_KEY
    }
    
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            print(f"📡 API Hub Realtime Fetch: calling kma_sfctm2.php for Station {stn_id} (Latest)...")
            response = await client.get(API_URL, params=params)
            
            if response.status_code != 200:
                print(f"❌ API Hub Error: HTTP {response.status_code}")
                return None
            
            res_text = response.text
            if "활용신청이 필요한 API" in res_text or "유효하지 않은 API" in res_text:
                print("❌ KMA API Hub Response Error: Unauthorized API in realtime fetch.")
                return None
                
            # 공백 구분자 텍스트 파싱
            lines = res_text.splitlines()
            header_idx = {}
            data_rows = []
            
            def is_missing(v: str) -> bool:
                return v in ["-9", "-9.0", "-99", "-99.0", "-999", "-999.0", "", None]
                
            # 1. 헤더 파싱
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                if line.startswith("#"):
                    cleaned = line.lstrip("#").strip()
                    cols = [c.strip().upper() for c in cleaned.split()]
                    if "YYMMDDHHMI" in cols and "STN" in cols:
                        for idx, col in enumerate(cols):
                            if col not in header_idx:
                                header_idx[col] = idx
                    continue
                    
                parts = line.split()
                if header_idx and len(parts) >= len(header_idx):
                    data_rows.append(parts)
                    
            if not header_idx:
                # 기본 헤더 인덱스 매핑 백업
                header_idx = {"YYMMDDHHMI": 0, "STN": 1, "WD": 2, "WS": 3, "TA": 12, "HM": 14}
                
            time_col = "YYMMDDHHMI" if "YYMMDDHHMI" in header_idx else "TM"
            
            # 기온(TA), 습도(HM), 풍속(WS) 추출
            if not data_rows:
                print("⚠️ No realtime data rows found in response.")
                return None
                
            # 가장 최신인 마지막 데이터 레코드 선택
            latest_row = data_rows[-1]
            ta_str = latest_row[header_idx["TA"]]
            hm_str = latest_row[header_idx["HM"]]
            ws_str = latest_row[header_idx["WS"]]
            
            if is_missing(ta_str) or is_missing(hm_str) or is_missing(ws_str):
                print("⚠️ Missing values in latest realtime weather row.")
                return None
                
            weather_data = {
                "temperature": float(ta_str),
                "humidity": float(hm_str),
                "wind_speed": float(ws_str)
            }
            
            # 이상값 체크
            if weather_data["temperature"] < -90 or weather_data["humidity"] < 0 or weather_data["wind_speed"] < 0:
                print("⚠️ Out of range values in realtime weather row.")
                return None
                
            return weather_data
            
    except Exception as e:
        print(f"❌ API Hub Exception in realtime fetch: {e}")
        return None

async def get_realtime_weather(region_id: int, stn_id: int) -> Dict[str, Any]:
    """캐싱 메커니즘을 적용한 실시간 날씨 데이터 조회 메인 함수입니다."""
    # 1. 캐시 조회
    try:
        cache = get_weather_cache(region_id)
    except Exception as e:
        print(f"⚠️ Cache query failed: {e}")
        cache = None

    if cache:
        try:
            created_str = cache["created_at"].replace("Z", "+00:00")
            created_at = datetime.datetime.fromisoformat(created_str)
            utc_now = datetime.datetime.now(created_at.tzinfo)
            # 1시간 이내이면 Cache Hit
            if utc_now - created_at < datetime.timedelta(hours=1):
                print("🚀 Cache Hit: Using weather data from Supabase weather_cache.")
                return {
                    "temperature": cache["temperature"],
                    "humidity": cache["humidity"],
                    "wind_speed": cache["wind_speed"],
                    "source": "cache"
                }
        except Exception as e:
            print(f"⚠️ Cache expiry check error: {e}")
    
    # 2. Cache Miss: API 직접 호출
    print("🔮 Cache Miss: Fetching live weather from KMA API Hub.")
    live_data = await fetch_realtime_weather_from_api(stn_id)
    
    if live_data:
        try:
            # DB 캐시 갱신
            upsert_weather_cache(
                region_id=region_id,
                temp=live_data["temperature"],
                humidity=live_data["humidity"],
                wind_speed=live_data["wind_speed"]
            )
        except Exception as e:
            print(f"⚠️ Failed to cache weather data: {e}")
            
        live_data["source"] = "api"
        return live_data
    
    # 3. Fallback: API 에러 시 기존 만료 캐시 강제 반환
    if cache:
        print("⚠️ Fallback: KMA API Hub failed. Returning expired cache data.")
        return {
            "temperature": cache["temperature"],
            "humidity": cache["humidity"],
            "wind_speed": cache["wind_speed"],
            "source": "expired_cache"
        }
        
    # 4. 최종 Fallback (더미 기상값 반환)
    print("⚠️ Fallback: KMA API Hub & cache both failed. Returning default fallback weather.")
    return {
        "temperature": 29.5,
        "humidity": 65.0,
        "wind_speed": 1.5,
        "source": "fallback_mock"
    }
