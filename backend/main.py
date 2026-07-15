import sys
import os
import math
import datetime

# Windows 콘솔 한글 및 이모지 출력 시 cp949 인코딩 오류 방지
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except AttributeError:
        pass
from typing import Optional, Dict, Any, List
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from contextlib import asynccontextmanager

# APScheduler imports
from apscheduler.schedulers.background import BackgroundScheduler

# Import database and weather clients
from db_client import (
    get_location_by_name,
    get_all_locations,
    get_all_location_coordinates,
    get_weather_forecast_cache,
    upsert_weather_forecast_cache,
    insert_user_feedback,
    get_user_clo_bias,
    get_user_profile,
    upsert_user_profile,
    upsert_historical_weather_fact,
    seed_all_locations_into_db
)
from weather_client import get_weather_forecast_data, fetch_weather_forecast_from_api
from utci_pure import calculate_utci_pure as calc_utci_raw

# ─────────────────────────────────────────────
# 1. 로컬 피드백 폴백 캐시
# ─────────────────────────────────────────────
LOCAL_FEEDBACK_CACHE = {}

def get_user_clo_bias_with_fallback(user_id: str) -> float:
    db_bias = get_user_clo_bias(user_id) or 0.0
    local_logs = LOCAL_FEEDBACK_CACHE.get(user_id, [])
    if not local_logs:
        return db_bias
    total_bias = db_bias
    for ftype in local_logs[-5:]:
        if ftype == "too_hot":
            total_bias -= 0.1
        elif ftype == "too_cold":
            total_bias += 0.1
    return round(max(-0.3, min(0.3, total_bias)), 2)

# ─────────────────────────────────────────────
# 2. Haversine 거리 계산 함수
# ─────────────────────────────────────────────
def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """두 위경도 사이의 거리를 km 단위로 구합니다."""
    R = 6371.0  # 지구 반지름 (km)
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (math.sin(d_lat / 2) ** 2 + 
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * (math.sin(d_lon / 2) ** 2))
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

# ─────────────────────────────────────────────
# 3. 정기 배치 스케줄러 (APScheduler) 태스크 정의
# ─────────────────────────────────────────────
def run_weather_collect_batch():
    """
    3시간 주기 전국 거점 순회 데이터 수집 스케줄러
    - location_dimension의 모든 거점 순회
    - Open-Meteo API 호출하여 예보 취득
    - 24시간 전체 예보에 대해 UTCI 선계산 수행 후 weather_forecast_cache에 적재
    """
    print(f"⏰ [Batch] Starting weather collect and UTCI pre-calculation batch task: {datetime.datetime.now()}")
    locations = get_all_location_coordinates()
    if not locations:
        print("⚠️ [Batch] No location coordinates found in location_dimension.")
        return
        
    today_str = (datetime.datetime.utcnow() + datetime.timedelta(hours=9)).strftime("%Y-%m-%d")
    
    # 동기식 헬퍼 함수로 Open-Meteo 호출
    import asyncio
    
    async def process_location(loc):
        loc_id = loc["id"]
        lat = float(loc["latitude"])
        lon = float(loc["longitude"])
        
        # 1. Open-Meteo API에서 기상 데이터 긁어오기
        hourly_raw = await fetch_weather_forecast_from_api(lat, lon)
        if not hourly_raw:
            print(f"⚠️ [Batch] Failed to fetch weather for {loc['sido']} {loc['sigungu']}")
            return
            
        # 2. 24시간 시간별 기온, 습도, 풍속, 일사량 데이터를 바탕으로 UTCI 선계산
        temperatures = hourly_raw.get("temperature_2m", [])
        humidities = hourly_raw.get("relativehumidity_2m", [])
        wind_speeds = hourly_raw.get("windspeed_10m", [])
        radiations = hourly_raw.get("shortwave_radiation", [])
        
        utci_list = []
        for i in range(len(temperatures)):
            tdb = temperatures[i]
            rh = humidities[i]
            v10 = wind_speeds[i]
            solar_rad = radiations[i]
            
            # 실외 기준: 10m 풍속 및 일사량 기반 Tmrt 연산
            # Tmrt = tdb + 0.0014 * shortwave_radiation
            tmrt = round(tdb + 0.0014 * solar_rad, 1)
            
            # UTCI 계산 (최소 풍속 0.5m/s 보정은 calc_utci_raw 내부 처리)
            try:
                utci_val = round(calc_utci_raw(tdb=tdb, tr=tmrt, v=v10, rh=rh), 2)
            except Exception as e:
                utci_val = round(tdb + (tmrt - tdb) * 0.35 - max(0.0, v10 - 0.5) * 2.0, 2)
                
            utci_list.append(utci_val)
            
        # 계산 결과 리스트를 JSON 구조에 보존
        hourly_raw["utci"] = utci_list
        
        # 3. DB 캐시에 Upsert
        upsert_weather_forecast_cache(
            location_id=loc_id,
            date_str=today_str,
            hourly_data=hourly_raw
        )
        
        # 4. 시간대별(24h)로 개별 날씨 및 산출된 UTCI를 historical_weather_fact 테이블에 Staging 요약 적재
        time_strings = hourly_raw.get("time", [])
        for idx in range(min(24, len(temperatures))):
            try:
                # ISO 시간 문자열 파싱 (예: "2026-07-14T00:00" -> 날짜: "2026-07-14", 시간: 0)
                t_str = time_strings[idx]
                date_part, time_part = t_str.split("T")
                hour_part = int(time_part.split(":")[0])
                
                upsert_historical_weather_fact(
                    location_id=loc_id,
                    weather_date=date_part,
                    hour=hour_part,
                    temp=temperatures[idx],
                    hum=humidities[idx],
                    wind=wind_speeds[idx],
                    solar=radiations[idx],
                    utci=utci_list[idx]
                )
            except Exception as ex:
                print(f"⚠️ [Batch] Failed to insert historical fact at index {idx} for {loc['sigungu']}: {ex}")
                
        print(f"✅ [Batch] Successfully calculated, cached, and staged historical weather facts for {loc['sido']} {loc['sigungu']}")


    # 비동기 함수 실행 처리
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    for loc in locations:
        try:
            loop.run_until_complete(process_location(loc))
        except Exception as e:
            print(f"❌ [Batch] Error processing location {loc.get('sigungu')}: {e}")
    loop.close()
    print("⏰ [Batch] Weather collection batch task finished.")

# ─────────────────────────────────────────────
# 4. FastAPI 라이프사이클 이벤트 (스케줄러 설정)
# ─────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 스타트업 시 전국 82개 거점 데이터 Supabase DB에 자동 동기화 시딩
    try:
        seed_all_locations_into_db()
    except Exception as se:
        print(f"⚠️ [Startup] Auto-seeding failed, utilizing local fallback lists: {se}")

    # 스타트업 시 배치 스케줄러 등록
    scheduler = BackgroundScheduler()
    # 3시간마다 백그라운드 크론 실행 설정
    scheduler.add_job(run_weather_collect_batch, 'interval', hours=3, id='weather_collect_job')
    scheduler.start()
    print("🚀 Background scheduler started. Weather collect batch registered (every 3 hours).")
    
    # 서버 기동 시 최초 1회 즉시 실행하여 캐시 확보 (비동기 스레드 실행 방해 없이 백그라운드 실행)
    import threading
    threading.Thread(target=run_weather_collect_batch, daemon=True).start()
    
    yield
    # 셧다운 시 스케줄러 중단
    scheduler.shutdown()
    print("🛑 Background scheduler stopped.")

# ─────────────────────────────────────────────
# 5. FastAPI 앱 초기화
# ─────────────────────────────────────────────
app = FastAPI(
    title="Personalized Clothing Recommendation API (PCRS)",
    description="API for calculating UTCI-based public thermal comfort and PMV/SET* individual nudge system",
    version="3.2.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────
# 6. Pydantic 모델
# ─────────────────────────────────────────────
class Profile(BaseModel):
    user_id: Optional[str] = "default_user"
    height: float             # cm
    weight: float             # kg
    age: Optional[int] = 30   # 나이
    body_fat: Optional[float] = None  # 체지방률 %
    gender: str               # male | female
    environment: Optional[str] = "outdoor"  # indoor | outdoor
    activity_level: Optional[str] = "walking"  # sedentary | walking | cycling | running

class FeedbackRequest(BaseModel):
    user_id: str = "default_user"
    feedback_type: str
    utci_calculated: float = 0.0
    temperature: float
    clo_applied: float

class UserProfileRequest(BaseModel):
    user_id: str
    height: float
    weight: float
    age: int
    body_fat: Optional[float] = None
    gender: str
    environment: str
    activity_level: str

class RecommendationRequest(BaseModel):
    profile: Profile
    latitude: float
    longitude: float
    selected_hour: Optional[int] = None
    lang: Optional[str] = "ko"  # ko | en | ja

# ─────────────────────────────────────────────
# 7. 개인화 생체 변수 및 오프셋 산출 헬퍼
# ─────────────────────────────────────────────
def compute_dubois_bsa(weight_kg: float, height_cm: float) -> float:
    """DuBois & DuBois 체표면적(Body Surface Area) 공식"""
    return round(0.007184 * (weight_kg ** 0.425) * (height_cm ** 0.725), 4)

def compute_age_sensitivity_offset(age: Optional[int]) -> float:
    """나이 기반 열감 민감도 오프셋 (UTCI 보정용, 단위: °C 상당)"""
    if age is None:
        return 0.0
    if age < 10:
        return -2.0  # 소아
    elif age < 18:
        return -1.0
    elif age < 30:
        return -0.5
    elif age < 50:
        return 0.0   # 기준 성인
    elif age < 65:
        return -0.5
    else:
        return -2.0  # 고령자

def compute_fat_sensitivity_offset(gender: str, body_fat: Optional[float]) -> float:
    """체지방률 기반 열감 오프셋 (UTCI 보정용, 단위: °C 상당)"""
    if body_fat is None:
        return 0.0
    high_threshold = 25.0 if gender == "male" else 32.0
    low_threshold = 12.0 if gender == "male" else 18.0
    if body_fat > high_threshold + 10:
        return 1.5   # 고도 비만
    elif body_fat > high_threshold:
        return 0.8   # 과체중
    elif body_fat < low_threshold:
        return -1.0  # 저체지방
    else:
        return 0.0

def compute_met_personalized(gender: str, body_fat: Optional[float], activity_level: str) -> float:
    """개인화 대사량(MET) 산출"""
    activity_met = {
        "sedentary": 1.0, 
        "walking": 2.0, 
        "cycling": 4.0, 
        "running": 6.0
    }
    base_met = activity_met.get(activity_level, 2.0)
    if gender == "female":
        base_met *= 0.92
    if body_fat is not None:
        high_fat_threshold = 25.0 if gender == "male" else 32.0
        if body_fat > high_fat_threshold:
            base_met -= 0.1
    return round(max(0.8, base_met), 2)

def compute_clo_from_utci(utci_val: float, gender: str) -> float:
    """UTCI 기반 착의 단열계수(CLO) 추정"""
    if utci_val > 46:
        base_clo = 0.15
    elif utci_val > 38:
        base_clo = 0.2
    elif utci_val > 32:
        base_clo = 0.3
    elif utci_val > 26:
        base_clo = 0.5
    elif utci_val > 9:
        base_clo = 0.7
    elif utci_val > 0:
        base_clo = 1.0
    elif utci_val > -13:
        base_clo = 1.2
    elif utci_val > -27:
        base_clo = 1.5
    else:
        base_clo = 2.0
    if gender == "female":
        base_clo = round(base_clo * 0.92, 2)
    return round(max(0.1, base_clo), 2)

# ─────────────────────────────────────────────
# 8. API 엔드포인트
# ─────────────────────────────────────────────
@app.get("/health")
def health_check():
    return {"status": "ok", "message": "PCRS API v3.2 (Open-Meteo & Individual Nudge) is running."}

@app.get("/api/v1/regions")
def get_regions():
    """location_dimension 테이블의 sido/sigungu 목록을 반환합니다."""
    regions = get_all_locations()
    grouped: dict = {}
    for r in regions:
        sido = r["sido"]
        sigungu = r["sigungu"]
        if sido not in grouped:
            grouped[sido] = []
        grouped[sido].append(sigungu)

    if not grouped:
        print("⚠️ Supabase location_dimension is empty. Returning fallback regions.")
        grouped = {
            "서울특별시": ["강남구", "서초구", "송파구", "마포구", "종로구", "영등포구"],
            "경기도": ["수원시", "성남시"]
        }
    return {"regions": grouped}

@app.post("/api/v1/feedback")
def post_feedback(payload: FeedbackRequest):
    """피드백 수신 및 로깅. RLS 제한 시 인메모리 캐시로 폴백."""
    res = insert_user_feedback(
        user_id=payload.user_id,
        feedback_type=payload.feedback_type,
        utci=payload.utci_calculated,
        temp=payload.temperature,
        clo=payload.clo_applied
    )
    if not res:
        print(f"⚠️ Supabase insert failed (RLS). Caching locally for user: {payload.user_id}")
        if payload.user_id not in LOCAL_FEEDBACK_CACHE:
            LOCAL_FEEDBACK_CACHE[payload.user_id] = []
        LOCAL_FEEDBACK_CACHE[payload.user_id].append(payload.feedback_type)

    new_bias = get_user_clo_bias_with_fallback(payload.user_id)
    return {
        "status": "ok",
        "message": "피드백이 성공적으로 등록되었습니다.",
        "new_bias": new_bias
    }

@app.get("/api/v1/profile")
def get_profile_endpoint(user_id: str = Query(..., description="조회할 사용자 고유 ID")):
    """사용자 개인 신체 설정 조회"""
    profile = get_user_profile(user_id)
    if not profile:
        # 정보가 없을 경우 404 대신 클라이언트 편의를 위해 디폴트 신체 프로필 사양 반환
        return {
            "status": "not_found",
            "profile": {
                "user_id": user_id,
                "height": 171.0,
                "weight": 60.0,
                "age": 30,
                "body_fat": 22.0,
                "gender": "female",
                "environment": "outdoor",
                "activity_level": "walking"
            }
        }
    return {"status": "ok", "profile": profile}

@app.post("/api/v1/profile")
def post_profile_endpoint(payload: UserProfileRequest):
    """사용자 개인 신체 설정 저장 (Upsert)"""
    res = upsert_user_profile(
        user_id=payload.user_id,
        profile_data={
            "height": payload.height,
            "weight": payload.weight,
            "age": payload.age,
            "body_fat": payload.body_fat,
            "gender": payload.gender,
            "environment": payload.environment,
            "activity_level": payload.activity_level
        }
    )
    if not res:
        raise HTTPException(status_code=500, detail="프로필 정보 저장에 실패했습니다.")
    return {"status": "ok", "message": "프로필 정보가 저장되었습니다.", "profile": res}



@app.post("/api/v1/recommend")
async def get_recommendation(payload: RecommendationRequest):
    """
    Haversine 매핑 및 개인화 넛지 시스템을 갖춘 핵심 추천 API
    """
    profile = payload.profile
    lat_user = payload.latitude
    lon_user = payload.longitude
    selected_hour = payload.selected_hour
    lang = (payload.lang or "ko").lower()
    if lang not in ("ko", "en", "ja"):
        lang = "ko"

    # ── 1. 최단거리 거점 매핑 (Haversine 적용) ───────────
    locations = get_all_location_coordinates()
    mapped_location = None
    min_dist = float('inf')
    
    for loc in locations:
        dist = haversine_distance(lat_user, lon_user, float(loc["latitude"]), float(loc["longitude"]))
        if dist < min_dist:
            min_dist = dist
            mapped_location = loc
            
    # 거점 데이터가 DB에 없으면 서울 영등포구를 디폴트로 지정
    if not mapped_location:
        print("⚠️ No locations found in DB. Falling back to default (Seoul Yeongdeungpo).")
        mapped_location = {"id": 6, "sido": "서울특별시", "sigungu": "영등포구", "latitude": 37.5264, "longitude": 126.8962}
        min_dist = haversine_distance(lat_user, lon_user, 37.5264, 126.8962)

    # ── 2. 해당 거점의 예보 캐시 로드 ──────────────────
    loc_id = mapped_location["id"]
    loc_lat = float(mapped_location["latitude"])
    loc_lon = float(mapped_location["longitude"])
    
    forecast_wrapper = await get_weather_forecast_data(loc_id, loc_lat, loc_lon)
    hourly_data = forecast_wrapper["hourly_data"]
    
    current_time_obj = datetime.datetime.utcnow() + datetime.timedelta(hours=9)
    hour = selected_hour if selected_hour is not None else current_time_obj.hour
    
    # 시간 인덱스 획득 (오늘의 0~23시 범위)
    hour_idx = min(23, max(0, hour))
    
    # ── 3. 매핑된 시간대의 기상 요소 및 지역 UTCI 추출 ──────
    tdb = hourly_data["temperature_2m"][hour_idx]
    rh = hourly_data["relativehumidity_2m"][hour_idx]
    v_raw = hourly_data["windspeed_10m"][hour_idx]
    ghi = hourly_data["shortwave_radiation"][hour_idx]
    
    # 지역 기저 UTCI 획득 (DB에 선계산된 값이 없으면 실시간 계산)
    if "utci" in hourly_data and len(hourly_data["utci"]) > hour_idx:
        utci_raw = hourly_data["utci"][hour_idx]
    else:
        tmrt_raw = round(tdb + 0.0014 * ghi, 1)
        utci_raw = round(calc_utci_raw(tdb=tdb, tr=tmrt_raw, v=v_raw, rh=rh), 2)

    # ── 4. 개인화 체감 온도 연산 (나이, 체지방, 활동 상태 반영) ────
    is_outdoor = (profile.environment == "outdoor")
    v = v_raw if is_outdoor else 0.1
    tmrt = round(tdb + 0.0014 * ghi, 1) if is_outdoor else tdb
    
    # 생체 및 대사 변수 계산
    bsa = compute_dubois_bsa(profile.weight, profile.height)
    met = compute_met_personalized(profile.gender, profile.body_fat, profile.activity_level)
    
    # 개인화 오프셋 산출
    age_offset = compute_age_sensitivity_offset(profile.age)
    fat_offset = compute_fat_sensitivity_offset(profile.gender, profile.body_fat)
    
    # 피드백 바이어스 반영
    user_id = profile.user_id or "default_user"
    user_clo_bias = get_user_clo_bias_with_fallback(user_id)
    feedback_offset = user_clo_bias * -5.0  # CLO +0.1 ≈ UTCI -0.5°C 역산
    
    # 대사 활동 추가 보정 (활동 수준에 따른 체열 가산)
    # 가만히 있을 때(1.0 MET) 대비 걷기(2.0), 라이딩(4.0), 조깅(6.0) 시 체내 열 생성 가중
    activity_level = profile.activity_level or "walking"
    activity_utci_delta = 0.0
    if activity_level == "walking":
        activity_utci_delta = 1.0
    elif activity_level == "cycling":
        activity_utci_delta = 3.5
    elif activity_level == "running":
        activity_utci_delta = 6.0
        
    # 최종 개인화 체감 온도 산출
    utci_personalized = round(utci_raw + age_offset + fat_offset + feedback_offset + activity_utci_delta, 2)
    
    # 의류 CLO 산출
    base_clo = compute_clo_from_utci(utci_personalized, profile.gender)
    clo = round(max(0.1, base_clo + user_clo_bias), 2)

    # ── 5. 다국어 UTCI 등급 분류 및 추천 매핑 ───────────
    TEXTS = {
        "ko": {
            "extreme_heat": ("극도의 열 스트레스 (>46°C)", ["기능성 흡한속건 반팔", "통풍 린넨 팬츠"], "생명 위협 수준의 열 환경입니다. 야외 활동을 즉시 중단하고 냉방 공간으로 피하십시오.", "15분마다 150ml 이상의 차가운 이온음료를 섭취하세요."),
            "very_strong_heat": ("매우 강한 열 스트레스 (38~46°C)", ["가벼운 반팔 티셔츠", "얇은 린넨 반바지"], "낮 시간대 야외 활동을 피하고 반드시 그늘에서 휴식하세요.", "탈수 방지를 위해 30분마다 시원한 수분을 보충하세요."),
            "strong_heat": ("강한 열 스트레스 (32~38°C)", ["얇은 반팔 면 티셔츠", "가벼운 면바지"], "야외 활동 시간을 최소화하고 자주 쉬십시오.", "매 시간 300ml 이상 수분을 꼭 섭취하세요."),
            "moderate_heat": ("보통 열 스트레스 (26~32°C)", ["일반 반팔 티셔츠", "청바지 또는 면바지"], "통풍이 잘되는 환경을 선택해 야외 활동을 즐기세요.", "규칙적인 수분 보충을 권장합니다."),
            "comfortable": ("열적 쾌적 (9~26°C)", ["편안한 반팔 또는 얇은 긴팔", "가벼운 청바지"], "야외 활동을 즐기기에 최적의 날씨입니다!", "평소 수준의 수분을 섭취하세요."),
            "slight_cold": ("약간 추운 스트레스 (0~9°C)", ["얇은 긴팔 셔츠", "가디건"], "외출 시 얇은 겉옷을 챙기세요.", "따뜻한 음료를 주기적으로 마시는 걸 권장합니다."),
            "moderate_cold": ("보통 추운 스트레스 (-13~0°C)", ["긴팔 코튼 셔츠", "도톰한 가디건"], "체온 유지를 위해 레이어드 착의를 권장합니다.", "온차나 따뜻한 국물을 자주 섭취하세요."),
            "strong_cold": ("강한 추운 스트레스 (-27∼-13°C)", ["스웨터", "방풍 아우터"], "노출 부위를 최소화하고 따뜻한 실내에서 생활하세요.", "따뜻한 음식과 고칼로리 간식으로 에너지를 유지하세요."),
            "extreme_cold": ("극도의 추운 스트레스 (<-27°C)", ["두꺼운 패딩 아우터", "두꺼운 바지"], "야외 활동을 삼가고 노출을 최대한 줄이세요. 동상 위험이 있습니다.", "따뜻한 고열량 음식을 충분히 섭취하세요."),
        },
        "en": {
            "extreme_heat": ("Extreme Heat Stress (>46°C)", ["Moisture-wicking tee", "Breathable linen shorts"], "Life-threatening heat. Stop all outdoor activities immediately and find air conditioning.", "Drink 150ml of cold electrolyte drink every 15 minutes."),
            "very_strong_heat": ("Very Strong Heat Stress (38~46°C)", ["Light short-sleeve tee", "Thin linen shorts"], "Avoid outdoor activity during daytime. Rest in shaded, ventilated areas.", "Hydrate every 30 minutes to prevent dehydration."),
            "strong_heat": ("Strong Heat Stress (32~38°C)", ["Thin cotton short-sleeve", "Light cotton pants"], "Minimize outdoor exposure and rest frequently.", "Drink at least 300ml of water per hour."),
            "moderate_heat": ("Moderate Heat Stress (26~32°C)", ["Regular short-sleeve tee", "Jeans or cotton pants"], "Choose well-ventilated areas for outdoor activities.", "Regular hydration is recommended."),
            "comfortable": ("Thermal Comfort (9~26°C)", ["Comfortable short or thin long sleeve", "Light jeans"], "Perfect weather for outdoor activities!", "Maintain your usual fluid intake."),
            "slight_cold": ("Slight Cold Stress (0~9°C)", ["Thin long-sleeve shirt", "Light cardigan"], "Bring a thin outer layer when going out.", "Warm beverages are recommended."),
            "moderate_cold": ("Moderate Cold Stress (-13~0°C)", ["Long-sleeve cotton shirt", "Thick cardigan"], "Layer up to maintain body temperature.", "Drink warm tea or broth frequently."),
            "strong_cold": ("Strong Cold Stress (-27∼-13°C)", ["Sweater", "Windproof outer jacket"], "Minimize exposed skin and stay indoors.", "Warm meals and high-calorie snacks help maintain energy."),
            "extreme_cold": ("Extreme Cold Stress (<-27°C)", ["Heavy padded jacket", "Thick thermal pants"], "Avoid outdoors. Risk of frostbite. Stay warm.", "Eat warm, high-calorie foods regularly."),
        }
    }
    
    # 9단계 키 분류
    if utci_personalized > 46:
        utci_key = "extreme_heat"
    elif utci_personalized > 38:
        utci_key = "very_strong_heat"
    elif utci_personalized > 32:
        utci_key = "strong_heat"
    elif utci_personalized > 26:
        utci_key = "moderate_heat"
    elif utci_personalized >= 9:
        utci_key = "comfortable"
    elif utci_personalized >= 0:
        utci_key = "slight_cold"
    elif utci_personalized >= -13:
        utci_key = "moderate_cold"
    elif utci_personalized >= -27:
        utci_key = "strong_cold"
    else:
        utci_key = "extreme_cold"

    lang_texts = TEXTS.get(lang, TEXTS["ko"])
    thermal_sensation, clothing, activity, hydration = lang_texts[utci_key]

    # ── 6. 개인화 넛지(Nudge) 배너 생성 엔진 ──────────────────
    nudge_warning = False
    nudge_message = ""
    
    # 활동량에 의한 개인 온도가 높고, 격차가 벌어졌거나, 개인 체감이 강한 더위(32도) 이상일 때
    diff_temp = round(utci_personalized - utci_raw, 1)
    
    if nudge_warning == False: # 기본 조건 판정
        if diff_temp >= 3.0 or utci_personalized >= 32.0:
            nudge_warning = True
            
    if nudge_warning:
        # 활동별 맞춤 넛지 메시지 생성
        activity_ko = {"sedentary": "휴식", "walking": "보행", "cycling": "자전거 라이딩", "running": "러닝/운동"}.get(activity_level, "활동")
        
        if utci_personalized >= 38:
            nudge_message = (
                f"🚨 [{activity_ko} 주의] 현재 지역 UTCI는 {utci_raw:.1f}°C지만, 회원님의 개인 체감 온도는 "
                f"{utci_personalized:.1f}°C로 '매우 위험한 더위' 상태입니다. 즉시 활동을 멈추고 그늘로 대피하세요!"
            )
        else:
            nudge_message = (
                f"⚠️ [{activity_ko} 알림] 현재 지역 체감 지수는 {utci_raw:.1f}°C입니다. "
                f"하지만 {activity_ko} 중인 회원님의 개인 맞춤 온도는 {utci_personalized:.1f}°C로 더 더울 수 있으니 미지근한 물을 자주 보충하세요!"
            )

    # ── 7. 야외 활동별 적합도 산출 (백엔드 이관 고도화) ───────────
    # 기상 변수 안전 추출
    apparent_temp = hourly_data.get("apparent_temperature", [tdb]*168)[min(len(hourly_data.get("apparent_temperature", [tdb]*168))-1, hour_idx)]
    uv_val = hourly_data.get("uv_index", [0.0]*168)[min(len(hourly_data.get("uv_index", [0.0]*168))-1, hour_idx)]
    precip_prob = hourly_data.get("precipitation_probability", [0]*168)[min(len(hourly_data.get("precipitation_probability", [0]*168))-1, hour_idx)]
    pm10_val = hourly_data.get("pm10", [35.0]*168)[min(len(hourly_data.get("pm10", [35.0]*168))-1, hour_idx)]
    pm25_val = hourly_data.get("pm2_5", [15.0]*168)[min(len(hourly_data.get("pm2_5", [15.0]*168))-1, hour_idx)]

    run_score = 95
    cycle_score = 95
    walk_score = 95

    # 1) 열 스트레스 (UTCI 기반 감점)
    if utci_personalized >= 38:
        run_score = 15; cycle_score = 20; walk_score = 30
    elif utci_personalized >= 32:
        run_score = 40; cycle_score = 45; walk_score = 60
    elif utci_personalized >= 26:
        run_score = 70; cycle_score = 75; walk_score = 80
    elif utci_personalized < 9 and utci_personalized >= 0:
        run_score = 85; cycle_score = 80; walk_score = 75
    elif utci_personalized < 0 and utci_personalized >= -13:
        run_score = 60; cycle_score = 50; walk_score = 55
    elif utci_personalized < -13:
        run_score = 20; cycle_score = 15; walk_score = 25

    # 2) 자외선 지수 (UV Index) 감점
    uv_penalty = 0
    if uv_val >= 11:
        uv_penalty = 45
    elif uv_val >= 8:
        uv_penalty = 30
    elif uv_val >= 6:
        uv_penalty = 15
    elif uv_val >= 3:
        uv_penalty = 5
    run_score = max(10, run_score - uv_penalty)
    cycle_score = max(10, cycle_score - uv_penalty)
    walk_score = max(10, walk_score - uv_penalty)

    # 3) 강수 확률 (Precipitation Probability) 감점
    if precip_prob >= 81:
        run_score = max(10, run_score - 70)
        cycle_score = max(10, cycle_score - 85)
        walk_score = max(10, walk_score - 70)
    elif precip_prob >= 51:
        run_score = max(10, run_score - 40)
        cycle_score = max(10, cycle_score - 60)
        walk_score = max(10, walk_score - 40)
    elif precip_prob >= 21:
        run_score = max(10, run_score - 15)
        cycle_score = max(10, cycle_score - 30)
        walk_score = max(10, walk_score - 15)

    # 4) 미세먼지(PM10) 감점
    if pm10_val >= 151:
        run_score = max(10, run_score - 50)
        cycle_score = max(10, cycle_score - 50)
        walk_score = max(10, walk_score - 35)
    elif pm10_val >= 81:
        run_score = max(10, run_score - 25)
        cycle_score = max(10, cycle_score - 25)
        walk_score = max(10, walk_score - 15)
    elif pm10_val >= 31:
        run_score = max(10, run_score - 5)
        cycle_score = max(10, cycle_score - 5)
        walk_score = max(10, walk_score - 5)

    # 5) 초미세먼지(PM2.5) 감점
    if pm25_val >= 76:
        run_score = max(10, run_score - 50)
        cycle_score = max(10, cycle_score - 50)
        walk_score = max(10, walk_score - 40)
    elif pm25_val >= 36:
        run_score = max(10, run_score - 35)
        cycle_score = max(10, cycle_score - 35)
        walk_score = max(10, walk_score - 20)
    elif pm25_val >= 16:
        run_score = max(10, run_score - 5)
        cycle_score = max(10, cycle_score - 5)
        walk_score = max(10, walk_score - 5)

    # 등급 매핑 헬퍼 함수
    def get_suitability_level(score: int):
        if score >= 90:
            return {"label": "아주 좋음" if lang == "ko" else "Excellent", "color": "text-emerald-600 bg-emerald-50 border-emerald-100", "barColor": "bg-emerald-500"}
        elif score >= 75:
            return {"label": "좋음" if lang == "ko" else "Good", "color": "text-blue-600 bg-blue-50 border-blue-100", "barColor": "bg-blue-500"}
        elif score >= 50:
            return {"label": "보통" if lang == "ko" else "Moderate", "color": "text-amber-600 bg-amber-50 border-amber-100", "barColor": "bg-amber-500"}
        elif score >= 30:
            return {"label": "주의" if lang == "ko" else "Caution", "color": "text-orange-600 bg-orange-50 border-orange-100", "barColor": "bg-orange-500"}
        else:
            return {"label": "위험" if lang == "ko" else "Avoid", "color": "text-rose-600 bg-rose-50 border-rose-100", "barColor": "bg-rose-500"}

    suitability_data = [
        {"name": "🏃 러닝" if lang == "ko" else "Running", "score": run_score, **get_suitability_level(run_score)},
        {"name": "🚴 라이딩" if lang == "ko" else "Cycling", "score": cycle_score, **get_suitability_level(cycle_score)},
        {"name": "🚶 산책" if lang == "ko" else "Walking", "score": walk_score, **get_suitability_level(walk_score)},
    ]

    # ── 8. 최종 JSON 반환 ─────────────────────────────
    return {
        "mapped_location": {
            "sido": mapped_location["sido"],
            "sigungu": mapped_location["sigungu"],
            "distance_km": round(min_dist, 2)
        },
        "utci": utci_raw,
        "utci_personalized": utci_personalized,
        "utci_category": utci_key,
        "thermal_sensation": thermal_sensation,
        "pmv": utci_personalized, # 하위 호환
        "weather": {
            "temperature": tdb,
            "humidity": rh,
            "wind_speed": v_raw,
            "apparent_temperature": apparent_temp,
            "uv_index": uv_val,
            "precipitation_probability": precip_prob,
            "pm10": pm10_val,
            "pm2_5": pm25_val,
            "tmrt": tmrt,
            "shortwave_radiation": ghi,
            "source": forecast_wrapper["source"]
        },
        "body_params": {
            "bsa": bsa,
            "met": met,
            "age_offset": age_offset,
            "fat_offset": fat_offset,
            "user_clo_bias": user_clo_bias
        },
        "recommendations": {
            "clothing": clothing,
            "activity": activity,
            "hydration": hydration,
            "clo_applied": clo,
            "met_applied": met
        },
        "nudge": {
            "nudge_warning": nudge_warning,
            "nudge_message": nudge_message,
            "diff_temp": diff_temp
        },
        "suitability": suitability_data
    }

# ─────────────────────────────────────────────
# 9. 로컬 실행용 엔트리포인트
# ─────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8002, reload=True)
