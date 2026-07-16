import sys
import os
import math
import datetime
import json
import hashlib
import threading
import time
from collections import defaultdict, deque

# Windows 콘솔 한글 및 이모지 출력 시 cp949 인코딩 오류 방지
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except AttributeError:
        pass
from typing import Annotated, Literal, Optional, Dict, Any, List
from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
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
    get_personalized_analysis_cache,
    upsert_personalized_analysis_cache,
    invalidate_personalized_analysis_cache_for_user,
    get_phase1_consents,
    get_phase1_profile,
    upsert_phase1_consents,
    upsert_phase1_profile,
    get_wardrobe_items,
    create_wardrobe_item,
    archive_wardrobe_item,
    update_wardrobe_item,
    get_user_locations,
    create_user_location,
    update_user_location,
    delete_user_location,
    create_recommendation_feedback,
    clear_recommendation_feedback,
    get_recommendation_feedback_warmth_bias,
    cancel_account_deletion,
    execute_due_account_deletions,
    export_user_data,
    get_account_deletion_request,
    get_admin_client,
    request_account_deletion,
    seed_all_locations_into_db
)
from auth import AuthenticatedUser, require_authenticated_user
from weather_client import add_generic_utci, get_weather_forecast_data, fetch_weather_forecast_from_api, is_weather_forecast_cache_fresh
from utci_pure import calculate_utci_pure as calc_utci_raw

# ─────────────────────────────────────────────
# 1. 로컬 피드백 폴백 캐시
# ─────────────────────────────────────────────
def get_user_clo_bias_with_fallback(user_id: str) -> float:
    """Guest recommendations intentionally have no persisted preference bias.

    Signed-in recommendations use the RLS-protected recommendation_feedback
    table instead. Keeping the guest baseline neutral avoids the retired legacy
    feedback table and prevents unverified user IDs from influencing results.
    """
    return 0.0

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

        # Avoid refreshing a valid entry when the process restarts or another
        # worker has already completed the same scheduled batch.
        if is_weather_forecast_cache_fresh(get_weather_forecast_cache(loc_id, today_str)):
            print(f"⏭️ [Batch] Fresh cache exists for {loc['sido']} {loc['sigungu']}; skipping.")
            return
        
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
        hourly_raw = add_generic_utci(hourly_raw)
        
        # 3. DB 캐시에 Upsert
        upsert_weather_forecast_cache(
            location_id=loc_id,
            date_str=today_str,
            hourly_data=hourly_raw
        )
        
        # Historical fact staging was retired: the forecast cache is the sole
        # weather persistence layer used by the product.
        time_strings = hourly_raw.get("time", [])
        for idx in ():
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


def run_account_deletion_batch():
    """Run the irreversible cleanup only after the 30-day recovery window."""
    completed = execute_due_account_deletions()
    if completed:
        print(f"🗑️ [Batch] Permanently deleted {completed} expired account(s).")

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
    scheduler.add_job(
        run_weather_collect_batch,
        'interval',
        hours=int(os.getenv("WEATHER_BATCH_INTERVAL_HOURS", "3")),
        id='weather_collect_job',
        coalesce=True,
        max_instances=1,
    )
    scheduler.add_job(run_account_deletion_batch, 'interval', days=1, id='account_deletion_job')
    scheduler.start()
    print("🚀 Background scheduler started. Weather collect batch registered (every 3 hours).")
    
    # A full nationwide warmup is expensive. Enable it only on one designated
    # worker; normal requests still fetch a missing location on demand.
    if os.getenv("WEATHER_WARMUP_ON_STARTUP", "false").lower() == "true":
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

# Browser clients must be explicitly trusted when Authorization headers and
# credentials are used. Add the deployed web origin through CORS_ALLOW_ORIGINS.
CORS_ALLOW_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ALLOW_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOW_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# This process-local limit protects public routes that can trigger weather
# provider work. Apply an equivalent edge/proxy limit in production when the
# API runs with multiple workers.
PUBLIC_RECOMMEND_RATE_LIMIT = int(os.getenv("PUBLIC_RECOMMEND_RATE_LIMIT", "20"))
RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))
_recommendation_requests: dict[str, deque[float]] = defaultdict(deque)
_recommendation_rate_lock = threading.Lock()
RATE_LIMITED_PUBLIC_ROUTES = {
    ("POST", "/api/v1/recommend"),
    ("GET", "/api/v1/weather/daily"),
    ("GET", "/api/v1/weather/hourly"),
}


def _client_ip(request: Request) -> str:
    if os.getenv("TRUST_PROXY_HEADERS", "false").lower() == "true":
        forwarded_for = request.headers.get("x-forwarded-for", "")
        if forwarded_for:
            return forwarded_for.split(",", 1)[0].strip()
    return request.client.host if request.client else "unknown"


@app.middleware("http")
async def add_security_headers_and_limit_public_recommendations(request: Request, call_next):
    if (request.method, request.url.path) in RATE_LIMITED_PUBLIC_ROUTES:
        now = time.monotonic()
        client_ip = _client_ip(request)
        with _recommendation_rate_lock:
            recent = _recommendation_requests[client_ip]
            while recent and now - recent[0] >= RATE_LIMIT_WINDOW_SECONDS:
                recent.popleft()
            if len(recent) >= PUBLIC_RECOMMEND_RATE_LIMIT:
                return JSONResponse(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    content={"detail": "Too many weather analysis requests. Please try again shortly."},
                    headers={"Retry-After": str(RATE_LIMIT_WINDOW_SECONDS)},
                )
            recent.append(now)

    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(self)"
    if request.url.path.startswith("/api/v1/me/"):
        response.headers["Cache-Control"] = "no-store"
    return response

# ─────────────────────────────────────────────
# 6. Pydantic 모델
# ─────────────────────────────────────────────
class Profile(BaseModel):
    user_id: Optional[str] = "default_user"
    height: float = Field(ge=100, le=250)  # cm
    weight: float = Field(ge=25, le=300)  # kg
    age: Optional[int] = Field(default=30, ge=14, le=120)
    body_fat: Optional[float] = Field(default=None, ge=2, le=70)  # 체지방률 %
    gender: Literal["male", "female"]
    environment: Literal["indoor", "outdoor"] = "outdoor"
    activity_level: Literal["sedentary", "walking", "cycling", "running"] = "walking"

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
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    selected_hour: Optional[int] = Field(default=None, ge=0, le=167)
    lang: Optional[str] = "ko"  # ko | en | ja


class RecommendationBatchRequest(BaseModel):
    profile: Profile
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    selected_hours: List[Annotated[int, Field(ge=0, le=167)]] = Field(min_length=1, max_length=23)
    lang: Optional[str] = "ko"


class Phase1ProfileUpdateRequest(BaseModel):
    """Optional onboarding fields; absent values deliberately stay unknown."""

    height_cm: Optional[float] = Field(default=None, ge=100, le=250)
    weight_kg: Optional[float] = Field(default=None, ge=25, le=300)
    body_fat_pct: Optional[float] = Field(default=None, ge=3, le=70)
    birth_year: Optional[int] = Field(default=None, ge=1900, le=2100)
    sex: Optional[Literal["female", "male", "undisclosed"]] = None
    thermal_sensitivity: Optional[int] = Field(default=None, ge=-2, le=2)
    default_activity: Optional[Literal[
        "sedentary", "walking", "commute", "cycling", "running", "outdoor_work", "indoor_exercise"
    ]] = None
    default_environment: Optional[Literal["outdoor", "indoor", "mixed"]] = None
    indoor_temperature_c: Optional[float] = Field(default=None, ge=10, le=35)


class ConsentUpdateRequest(BaseModel):
    policy_version: str = Field(min_length=1, max_length=64)
    terms: bool
    privacy: bool
    marketing: bool = False


class WardrobeItemCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    category: Literal["top", "bottom", "outerwear", "shoes", "accessory", "other"]
    subcategory: Optional[str] = Field(default=None, max_length=40)
    material: Optional[str] = Field(default=None, max_length=40)
    notes: Optional[str] = Field(default=None, max_length=240)
    warmth_level: int = Field(default=0, ge=-2, le=2)
    water_resistant: bool = False
    is_favorite: bool = False
    seasons: List[Literal["spring", "summer", "fall", "winter"]] = ["spring", "summer", "fall", "winter"]
    is_in_laundry: bool = False


class WardrobeItemUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    category: Optional[Literal["top", "bottom", "outerwear", "shoes", "accessory", "other"]] = None
    subcategory: Optional[str] = Field(default=None, max_length=40)
    material: Optional[str] = Field(default=None, max_length=40)
    notes: Optional[str] = Field(default=None, max_length=240)
    warmth_level: Optional[int] = Field(default=None, ge=-2, le=2)
    water_resistant: Optional[bool] = None
    is_favorite: Optional[bool] = None
    seasons: Optional[List[Literal["spring", "summer", "fall", "winter"]]] = None
    is_in_laundry: Optional[bool] = None


class UserLocationCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    is_favorite: bool = True


class UserLocationUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    is_favorite: Optional[bool] = None


class RecommendationFeedbackCreateRequest(BaseModel):
    feedback_type: Literal["too_hot", "comfortable", "too_cold"]
    utci_personalized: Optional[float] = Field(default=None, ge=-80, le=80)
    activity: Optional[str] = Field(default=None, max_length=40)


class AccountDeletionRequest(BaseModel):
    confirmation_phrase: Literal["DELETE"]

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


@app.get("/api/v1/locations")
def get_location_catalog(query: str = Query(default="", max_length=80)):
    """Return selectable forecast locations with coordinates for the client picker."""
    locations = get_all_location_coordinates() or SEED_LOCATIONS
    needle = query.strip().lower()
    catalog = [
        {
            "id": str(location.get("id", f"{location['sido']}-{location['sigungu']}")),
            "name": f"{location['sido']} {location['sigungu']}",
            "sido": location["sido"],
            "sigungu": location["sigungu"],
            "latitude": float(location["latitude"]),
            "longitude": float(location["longitude"]),
        }
        for location in locations
        if not needle or needle in f"{location['sido']} {location['sigungu']}".lower()
    ]
    return {"locations": catalog}

@app.post("/api/v1/feedback")
def post_feedback(payload: FeedbackRequest):
    raise HTTPException(status_code=status.HTTP_410_GONE, detail="Legacy endpoint retired. Use /api/v1/me/recommendation-feedback.")
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
    raise HTTPException(status_code=status.HTTP_410_GONE, detail="Legacy endpoint retired. Use /api/v1/me/profile.")
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
    raise HTTPException(status_code=status.HTTP_410_GONE, detail="Legacy endpoint retired. Use PATCH /api/v1/me/profile.")
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



@app.get("/api/v1/me/profile")
def get_my_profile(current_user: AuthenticatedUser = Depends(require_authenticated_user)):
    """Return only the caller's Phase 1 personalization profile."""
    profile = get_phase1_profile(current_user.access_token, current_user.user_id)
    return {
        "status": "ok",
        "profile": profile,
        "onboarding_complete": profile is not None,
    }


@app.patch("/api/v1/me/profile")
def update_my_profile(
    payload: Phase1ProfileUpdateRequest,
    current_user: AuthenticatedUser = Depends(require_authenticated_user),
):
    """Update the caller's optional personalization fields through RLS."""
    if payload.birth_year is not None:
        current_year = datetime.datetime.now(datetime.timezone.utc).year
        if not current_year - 120 <= payload.birth_year <= current_year - 14:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="birth_year must represent an age between 14 and 120.",
            )

    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide at least one profile field to update.",
        )

    updated = upsert_phase1_profile(current_user.access_token, current_user.user_id, changes)
    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Profile storage is unavailable. Confirm the Phase 1 migration has been applied.",
        )
    invalidate_personalized_analysis_cache_for_user(current_user.user_id)
    return {"status": "ok", "profile": updated}


@app.get("/api/v1/me/consents")
def get_my_consents(current_user: AuthenticatedUser = Depends(require_authenticated_user)):
    """Return the caller's recorded terms, privacy, and marketing choices."""
    consents = get_phase1_consents(current_user.access_token, current_user.user_id)
    return {"status": "ok", "consents": consents}


@app.put("/api/v1/me/consents")
def update_my_consents(
    payload: ConsentUpdateRequest,
    current_user: AuthenticatedUser = Depends(require_authenticated_user),
):
    """Record current consent state; terms and privacy are required for an account."""
    if not payload.terms or not payload.privacy:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Terms and privacy consent are required.",
        )

    consents = upsert_phase1_consents(
        current_user.access_token,
        current_user.user_id,
        payload.policy_version,
        {"terms": payload.terms, "privacy": payload.privacy, "marketing": payload.marketing},
    )
    if consents is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Consent storage is unavailable. Confirm the Phase 1 migration has been applied.",
        )
    return {"status": "ok", "consents": consents}


@app.get("/api/v1/me/wardrobe")
def get_my_wardrobe(current_user: AuthenticatedUser = Depends(require_authenticated_user)):
    return {"status": "ok", "items": get_wardrobe_items(current_user.access_token, current_user.user_id)}


@app.post("/api/v1/me/wardrobe", status_code=status.HTTP_201_CREATED)
def add_my_wardrobe_item(
    payload: WardrobeItemCreateRequest,
    current_user: AuthenticatedUser = Depends(require_authenticated_user),
):
    item = create_wardrobe_item(current_user.access_token, current_user.user_id, payload.model_dump())
    if item is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Wardrobe storage is unavailable. Confirm the Phase 3 migration has been applied.")
    invalidate_personalized_analysis_cache_for_user(current_user.user_id)
    return {"status": "ok", "item": item}


@app.patch("/api/v1/me/wardrobe/{item_id}")
def update_my_wardrobe_item(
    item_id: str,
    payload: WardrobeItemUpdateRequest,
    current_user: AuthenticatedUser = Depends(require_authenticated_user),
):
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Provide at least one wardrobe field to update.")
    item = update_wardrobe_item(current_user.access_token, current_user.user_id, item_id, changes)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wardrobe item was not found.")
    invalidate_personalized_analysis_cache_for_user(current_user.user_id)
    return {"status": "ok", "item": item}


@app.delete("/api/v1/me/wardrobe/{item_id}")
def remove_my_wardrobe_item(
    item_id: str,
    current_user: AuthenticatedUser = Depends(require_authenticated_user),
):
    if not archive_wardrobe_item(current_user.access_token, current_user.user_id, item_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wardrobe item was not found.")
    invalidate_personalized_analysis_cache_for_user(current_user.user_id)
    return {"status": "ok"}


@app.get("/api/v1/me/locations")
def get_my_locations(current_user: AuthenticatedUser = Depends(require_authenticated_user)):
    return {"status": "ok", "locations": get_user_locations(current_user.access_token, current_user.user_id)}


@app.post("/api/v1/me/locations", status_code=status.HTTP_201_CREATED)
def add_my_location(
    payload: UserLocationCreateRequest,
    current_user: AuthenticatedUser = Depends(require_authenticated_user),
):
    location = create_user_location(current_user.access_token, current_user.user_id, payload.model_dump())
    if location is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Location storage is unavailable. Confirm the saved locations migration has been applied.")
    return {"status": "ok", "location": location}


@app.patch("/api/v1/me/locations/{location_id}")
def update_my_location(
    location_id: str,
    payload: UserLocationUpdateRequest,
    current_user: AuthenticatedUser = Depends(require_authenticated_user),
):
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Provide at least one location field to update.")
    location = update_user_location(current_user.access_token, current_user.user_id, location_id, changes)
    if location is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved location was not found.")
    return {"status": "ok", "location": location}


@app.delete("/api/v1/me/locations/{location_id}")
def remove_my_location(
    location_id: str,
    current_user: AuthenticatedUser = Depends(require_authenticated_user),
):
    if not delete_user_location(current_user.access_token, current_user.user_id, location_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved location was not found.")
    return {"status": "ok"}


@app.post("/api/v1/me/recommendation-feedback", status_code=status.HTTP_201_CREATED)
def add_recommendation_feedback(
    payload: RecommendationFeedbackCreateRequest,
    current_user: AuthenticatedUser = Depends(require_authenticated_user),
):
    feedback = create_recommendation_feedback(current_user.access_token, current_user.user_id, payload.model_dump(exclude_none=True))
    if feedback is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Feedback storage is unavailable. Confirm the Phase 3 migration has been applied.")
    invalidate_personalized_analysis_cache_for_user(current_user.user_id)
    return {
        "status": "ok",
        "feedback": feedback,
        "warmth_bias": get_recommendation_feedback_warmth_bias(current_user.access_token, current_user.user_id),
    }


@app.delete("/api/v1/me/recommendation-feedback")
def clear_my_recommendation_feedback(current_user: AuthenticatedUser = Depends(require_authenticated_user)):
    if not clear_recommendation_feedback(current_user.access_token, current_user.user_id):
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Feedback reset is unavailable.")
    invalidate_personalized_analysis_cache_for_user(current_user.user_id)
    return {"status": "ok"}


@app.get("/api/v1/me/data-export")
def get_my_data_export(current_user: AuthenticatedUser = Depends(require_authenticated_user)):
    """Download currently stored personal data as a JSON attachment."""
    exported = export_user_data(current_user.access_token, current_user.user_id)
    if not exported:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Data export is unavailable. Confirm the database migrations have been applied.")
    return Response(
        content=json.dumps(exported, ensure_ascii=False, default=str),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=pcrs-data-export.json"},
    )


@app.get("/api/v1/me/deletion-request")
def get_my_deletion_request(current_user: AuthenticatedUser = Depends(require_authenticated_user)):
    return {"status": "ok", "request": get_account_deletion_request(current_user.access_token, current_user.user_id)}


@app.post("/api/v1/me/deletion-request", status_code=status.HTTP_202_ACCEPTED)
def create_my_deletion_request(
    payload: AccountDeletionRequest,
    current_user: AuthenticatedUser = Depends(require_authenticated_user),
):
    if get_admin_client() is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Account deletion is not configured on this deployment.")
    if not current_user.recently_authenticated():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in again within 10 minutes before requesting account deletion.")
    request = request_account_deletion(current_user.access_token, current_user.user_id)
    if request is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Account deletion request storage is unavailable. Confirm the Phase 4 migration has been applied.")
    return {"status": "ok", "request": request}


@app.delete("/api/v1/me/deletion-request")
def cancel_my_deletion_request(current_user: AuthenticatedUser = Depends(require_authenticated_user)):
    if not cancel_account_deletion(current_user.access_token, current_user.user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active deletion request was found.")
    return {"status": "ok", "message": "Account deletion has been cancelled."}


@app.get("/api/v1/weather/daily")
async def get_daily_weather_summary(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
):
    """Return seven daily summaries derived from the shared hourly forecast."""
    locations = get_all_location_coordinates() or SEED_LOCATIONS
    mapped_location = min(
        locations,
        key=lambda location: haversine_distance(
            latitude,
            longitude,
            float(location["latitude"]),
            float(location["longitude"]),
        ),
    )
    forecast_wrapper = await get_weather_forecast_data(
        mapped_location["id"],
        float(mapped_location["latitude"]),
        float(mapped_location["longitude"]),
    )
    hourly_data = forecast_wrapper["hourly_data"]
    daily: Dict[str, Dict[str, List[float]]] = defaultdict(lambda: {
        "temperatures": [], "humidities": [], "precipitation_probabilities": [],
    })
    for index, timestamp in enumerate(hourly_data.get("time", [])):
        if index >= len(hourly_data.get("temperature_2m", [])):
            break
        day = timestamp[:10]
        daily[day]["temperatures"].append(float(hourly_data["temperature_2m"][index]))
        if index < len(hourly_data.get("relativehumidity_2m", [])):
            daily[day]["humidities"].append(float(hourly_data["relativehumidity_2m"][index]))
        if index < len(hourly_data.get("precipitation_probability", [])):
            daily[day]["precipitation_probabilities"].append(float(hourly_data["precipitation_probability"][index]))

    summaries = [
        {
            "date": day,
            "temperature_min": round(min(values["temperatures"]), 1),
            "temperature_max": round(max(values["temperatures"]), 1),
            "humidity_avg": round(sum(values["humidities"]) / len(values["humidities"])) if values["humidities"] else None,
            "precipitation_probability_max": round(max(values["precipitation_probabilities"])) if values["precipitation_probabilities"] else 0,
        }
        for day, values in sorted(daily.items())[:7]
        if values["temperatures"]
    ]
    return {
        "location": {"sido": mapped_location["sido"], "sigungu": mapped_location["sigungu"]},
        "daily": summaries,
        "source": forecast_wrapper["source"],
    }


@app.get("/api/v1/weather/hourly")
async def get_hourly_weather_detail(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    date: Optional[datetime.date] = Query(default=None),
):
    """Return a selected day's hourly conditions from the shared forecast cache."""
    locations = get_all_location_coordinates() or SEED_LOCATIONS
    mapped_location = min(
        locations,
        key=lambda location: haversine_distance(
            latitude,
            longitude,
            float(location["latitude"]),
            float(location["longitude"]),
        ),
    )
    forecast_wrapper = await get_weather_forecast_data(
        mapped_location["id"],
        float(mapped_location["latitude"]),
        float(mapped_location["longitude"]),
    )
    hourly_data = forecast_wrapper["hourly_data"]
    target_date = date.isoformat() if date else (datetime.datetime.utcnow() + datetime.timedelta(hours=9)).strftime("%Y-%m-%d")
    entries = []
    for index, timestamp in enumerate(hourly_data.get("time", [])):
        if not timestamp.startswith(target_date):
            continue
        if index >= len(hourly_data.get("temperature_2m", [])):
            continue
        entries.append({
            "time": timestamp,
            "temperature": hourly_data["temperature_2m"][index],
            "apparent_temperature": hourly_data.get("apparent_temperature", [hourly_data["temperature_2m"][index]])[index],
            "humidity": hourly_data.get("relativehumidity_2m", [None] * len(hourly_data["time"]))[index],
            "wind_speed": hourly_data.get("windspeed_10m", [None] * len(hourly_data["time"]))[index],
            "precipitation_probability": hourly_data.get("precipitation_probability", [0] * len(hourly_data["time"]))[index],
            "utci": hourly_data.get("utci", [None] * len(hourly_data["time"]))[index],
        })
    return {"date": target_date, "hourly": entries, "source": forecast_wrapper["source"]}


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
    # The provider returns an hourly timeline covering multiple days. Treat a
    # client-selected hour as an index into that timeline, rather than clipping
    # it to today's 00:00–23:00 range.
    time_values = hourly_data.get("time", [])
    if selected_hour is None:
        current_hour_key = current_time_obj.strftime("%Y-%m-%dT%H:00")
        try:
            hour_idx = time_values.index(current_hour_key)
        except ValueError:
            hour_idx = current_time_obj.hour
    else:
        hour_idx = selected_hour
    
    # 시간 인덱스 획득 (오늘의 0~23시 범위)
    max_hour_idx = min(
        len(time_values),
        len(hourly_data.get("temperature_2m", [])),
        len(hourly_data.get("relativehumidity_2m", [])),
        len(hourly_data.get("windspeed_10m", [])),
        len(hourly_data.get("shortwave_radiation", [])),
    ) - 1
    if max_hour_idx < 0:
        raise HTTPException(status_code=503, detail="Hourly weather forecast is unavailable.")
    hour_idx = min(max_hour_idx, max(0, hour_idx))
    
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
        "forecast_time": time_values[hour_idx] if hour_idx < len(time_values) else None,
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


@app.post("/api/v1/recommendations")
async def get_authenticated_recommendation(
    payload: RecommendationRequest,
    current_user: AuthenticatedUser = Depends(require_authenticated_user),
):
    """Return a recommendation that safely prioritizes the member's own wardrobe.

    The legacy public endpoint remains available for guests. This authenticated
    endpoint derives the user ID solely from the verified JWT and uses RLS for
    both wardrobe and feedback reads.
    """
    payload.profile.user_id = current_user.user_id

    # Cache only authenticated results. The weather cache is shared, while this
    # cache is private and keyed by the personal inputs that affect the result.
    locations = get_all_location_coordinates() or SEED_LOCATIONS
    mapped_location = min(
        locations,
        key=lambda location: haversine_distance(
            payload.latitude,
            payload.longitude,
            float(location["latitude"]),
            float(location["longitude"]),
        ),
    )
    korea_now = datetime.datetime.utcnow() + datetime.timedelta(hours=9)
    forecast_date = korea_now.strftime("%Y-%m-%d")
    cache_hour = min(167, max(0, payload.selected_hour if payload.selected_hour is not None else korea_now.hour))
    profile_inputs = payload.profile.model_dump(exclude={"user_id"})
    profile_fingerprint = hashlib.sha256(
        json.dumps(profile_inputs, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    cached_result = get_personalized_analysis_cache(
        current_user.user_id,
        int(mapped_location["id"]),
        forecast_date,
        cache_hour,
        profile_fingerprint,
    )
    if cached_result is not None:
        cached_result["cache_status"] = "hit"
        return cached_result

    result = await get_recommendation(payload)
    wardrobe = get_wardrobe_items(current_user.access_token, current_user.user_id)
    warmth_bias = get_recommendation_feedback_warmth_bias(current_user.access_token, current_user.user_id)

    # Start from weather demand, then make a deliberately small correction from
    # feedback. Positive bias means the member has recently felt cold.
    thermal_index = result["utci_personalized"]
    target_warmth = 1 if thermal_index < 9 else -1 if thermal_index > 26 else 0
    target_warmth = max(-2, min(2, target_warmth + warmth_bias))
    month = datetime.datetime.now().month
    current_season = "spring" if month in (3, 4, 5) else "summer" if month in (6, 7, 8) else "fall" if month in (9, 10, 11) else "winter"
    available_items = [item for item in wardrobe if not item.get("is_in_laundry", False)]
    in_season_items = [item for item in available_items if current_season in item.get("seasons", ["spring", "summer", "fall", "winter"])]
    selected = sorted(
        in_season_items or available_items,
        key=lambda item: (
            not item.get("is_favorite", False),
            abs(float(item.get("warmth_level", 0)) - target_warmth),
            item.get("category", "other"),
        ),
    )[:3]
    if selected:
        own_items = [f"내 옷장: {item['name']}" for item in selected]
        result["recommendations"]["clothing"] = own_items + result["recommendations"]["clothing"]
    result["personalization"] = {
        "wardrobe_items_used": len(selected),
        "feedback_warmth_bias": warmth_bias,
        "target_warmth_level": target_warmth,
        "current_season": current_season,
    }
    result["cache_status"] = "miss"
    upsert_personalized_analysis_cache(
        current_user.user_id,
        int(mapped_location["id"]),
        forecast_date,
        cache_hour,
        profile_fingerprint,
        result,
    )
    return result


@app.post("/api/v1/recommendations/batch")
async def get_authenticated_recommendation_batch(
    payload: RecommendationBatchRequest,
    current_user: AuthenticatedUser = Depends(require_authenticated_user),
):
    """Return planned forecast hours in one authenticated request."""
    selected_hours = list(dict.fromkeys(payload.selected_hours))
    results = []
    for selected_hour in selected_hours:
        request_payload = RecommendationRequest(
            profile=payload.profile.model_copy(deep=True),
            latitude=payload.latitude,
            longitude=payload.longitude,
            selected_hour=selected_hour,
            lang=payload.lang,
        )
        result = await get_authenticated_recommendation(request_payload, current_user)
        results.append({"selected_hour": selected_hour, "recommendation": result})
    return {"recommendations": results}


# ─────────────────────────────────────────────
# 9. 로컬 실행용 엔트리포인트
# ─────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8002, reload=True)
