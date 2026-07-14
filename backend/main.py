import os
import math
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

# Import database and weather clients
from db_client import (
    get_region_by_name,
    get_historical_weather,
    get_all_regions,
    insert_user_feedback,
    get_user_clo_bias
)
from weather_client import get_realtime_weather

# UTCI 순수 Python 구현 (numba/DLL 의존성 없음)
from utci_pure import calculate_utci_pure as calc_utci_raw

# RLS 정책 또는 DB 쓰기 실패 시 피드백을 임시로 유지하기 위한 로컬 인메모리 캐시
LOCAL_FEEDBACK_CACHE = {}

# ─────────────────────────────────────────────
# 1. 로컬 폴백 헬퍼
# ─────────────────────────────────────────────
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
# 2. FastAPI 앱 초기화
# ─────────────────────────────────────────────
app = FastAPI(
    title="Personalized Clothing Recommendation API",
    description="API for calculating UTCI-based thermal comfort and recommendations",
    version="3.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────
# 3. Pydantic 모델
# ─────────────────────────────────────────────
class Profile(BaseModel):
    user_id: Optional[str] = "default_user"
    height: float             # cm
    weight: float             # kg
    age: Optional[int] = 30   # 나이 (신설)
    body_fat: Optional[float] = None  # 체지방률 %
    gender: str               # male | female
    environment: Optional[str] = "outdoor"  # indoor | outdoor
    activity_level: Optional[str] = "walking"  # sedentary | walking | jogging


class FeedbackRequest(BaseModel):
    user_id: str = "default_user"
    feedback_type: str
    utci_calculated: float = 0.0
    pmv_calculated: float = 0.0   # 하위 호환
    temperature: float
    clo_applied: float


class RecommendationRequest(BaseModel):
    profile: Profile
    sido: str = "서울특별시"
    sigungu: str = "강남구"
    selected_hour: Optional[int] = None
    lang: Optional[str] = "ko"  # ko | en | ja


# ─────────────────────────────────────────────
# 4. 개인화 생체 변수 환산 함수
# ─────────────────────────────────────────────
def compute_dubois_bsa(weight_kg: float, height_cm: float) -> float:
    """
    DuBois & DuBois 체표면적(Body Surface Area) 공식
    AD = 0.007184 × W^0.425 × H^0.725 [m²]
    """
    return round(0.007184 * (weight_kg ** 0.425) * (height_cm ** 0.725), 4)


def compute_age_sensitivity_offset(age: Optional[int]) -> float:
    """
    나이 기반 열감 민감도 오프셋 (UTCI 보정용, 단위: °C 상당)

    생리학적 근거:
    - 고령자(65세+)는 혈관 수축 반응 감소로 추위를 늦게 감지 → 추위에 실질적으로 더 취약
      실질 체감은 더 춥게 느끼므로 UTCI 값을 낮게 보정 (-1.5 ∼ -2.5°C)
    - 10세 미만 소아는 체표면적 대비 열손실이 크므로 추위에 더 취약 → 음수 오프셋
    - 30∼50세 성인 기준(0)
    """
    if age is None:
        return 0.0
    if age < 10:
        return -2.0
    elif age < 18:
        return -1.0
    elif age < 30:
        return -0.5
    elif age < 50:
        return 0.0
    elif age < 65:
        return -0.5
    else:
        return -2.0  # 고령자: 열조절 기능 저하


def compute_fat_sensitivity_offset(gender: str, body_fat: Optional[float]) -> float:
    """
    체지방률 기반 열감 오프셋 (UTCI 보정용, 단위: °C 상당)

    생리학적 근거:
    - 체지방이 높을수록 절연 효과로 더위를 늦게/추위를 일찍 느낌
    - 고체지방(남 >25%, 여 >32%)이면 더위에 더 민감하게 보정 (+오프셋)
    - 저체지방이면 추위에 민감 (−오프셋)
    """
    if body_fat is None:
        return 0.0

    high_threshold = 25.0 if gender == "male" else 32.0
    low_threshold = 12.0 if gender == "male" else 18.0

    if body_fat > high_threshold + 10:
        return 1.5   # 고도 비만: 더위에 매우 민감
    elif body_fat > high_threshold:
        return 0.8   # 과체중: 더위에 다소 민감
    elif body_fat < low_threshold:
        return -1.0  # 저체지방: 추위에 민감 (절연층 부족)
    else:
        return 0.0


def compute_met_personalized(
    gender: str,
    body_fat: Optional[float],
    activity_level: str
) -> float:
    """
    개인화 대사량(MET) 산출

    활동 수준별 기준 MET (ASHRAE 기반):
    - sedentary:  1.0 Met (앉아서 가만히)
    - walking:    2.0 Met (평지 걷기 4km/h)
    - jogging:    3.5 Met (가볍게 조깅)

    체지방·성별 보정:
    - 체지방률이 높을수록 대사 활성 조직(근육)이 적어 MET 감소
    """
    activity_met = {"sedentary": 1.0, "walking": 2.0, "jogging": 3.5}
    base_met = activity_met.get(activity_level, 2.0)

    # 성별 기초 보정
    if gender == "female":
        base_met *= 0.92  # 여성 평균 기초대사량 약 8% 낮음

    # 체지방 보정
    if body_fat is not None:
        high_fat_threshold = 25.0 if gender == "male" else 32.0
        if body_fat > high_fat_threshold:
            base_met -= 0.1  # 고체지방률: 대사 활성 조직 비중 감소

    return round(max(0.8, base_met), 2)


def compute_clo_from_utci(utci_val: float, gender: str) -> float:
    """
    UTCI 기반 착의 단열계수(CLO) 추정

    UTCI 9단계 기준 (WHO/ISO):
    - > 46°C : 극도의 열 스트레스 → 최소 착의
    - 38~46°C: 매우 강한 열 스트레스
    - 32~38°C: 강한 열 스트레스
    - 26~32°C: 보통 열 스트레스
    - 9~26°C : 열적 쾌적
    - 0~9°C  : 약간 추운 스트레스
    - -13~0°C: 보통 추운 스트레스
    - -27∼-13: 강한 추운 스트레스
    - < -27°C: 극도의 추운 스트레스
    """
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


def estimate_tmrt(tdb: float, is_outdoor: bool, selected_hour: Optional[int]) -> float:
    """
    평균 복사 온도(Tmrt) 추정

    실내: Tmrt ≈ 공기온도 (복사 교환 최소)
    실외: 시간대·계절 기반 일사량으로 Tmrt 가산
    - 태양이 높이 뜨는 오전 10시~오후 3시는 최대 +18°C 가산
    - 야간/새벽은 오히려 하늘 복사 냉각으로 -2°C 보정
    """
    if not is_outdoor:
        return tdb

    hour = selected_hour if selected_hour is not None else datetime.now().hour

    # 시간대별 일사 가산량 (°C, 여름 기준 맑은 날 추정)
    solar_addition_by_hour = {
        0: -2, 1: -2, 2: -2, 3: -2, 4: -1, 5: 0,
        6: 3,  7: 7,  8: 11, 9: 15, 10: 17, 11: 18,
        12: 18, 13: 17, 14: 16, 15: 14, 16: 11, 17: 8,
        18: 5, 19: 2,  20: 0, 21: -1, 22: -2, 23: -2
    }

    solar_delta = solar_addition_by_hour.get(hour, 5)
    return round(tdb + solar_delta, 1)


# ─────────────────────────────────────────────
# 5. API 엔드포인트
# ─────────────────────────────────────────────
@app.get("/health")
def health_check():
    return {"status": "ok", "message": "Personalized Clothing Recommendation API v3.0 (UTCI) is running."}


@app.get("/api/v1/regions")
def get_regions():
    """region_dimension 테이블의 sido/sigungu 목록을 반환합니다."""
    regions = get_all_regions()
    grouped: dict = {}
    for r in regions:
        sido = r["sido"]
        sigungu = r["sigungu"]
        if sido not in grouped:
            grouped[sido] = []
        grouped[sido].append(sigungu)

    if not grouped:
        print("⚠️ Supabase region_dimension table is empty. Returning local mock regions.")
        grouped = {
            "서울특별시": ["강남구", "서초구", "송파구", "마포구", "종로구"],
            "경기도": ["수원시", "성남시", "안양시", "고양시"],
            "부산광역시": ["해운대구", "수영구", "사하구", "중구"]
        }
    return {"regions": grouped}


@app.get("/api/v1/weather/realtime")
async def get_realtime_weather_api(
    sido: str = Query(..., description="시도 이름"),
    sigungu: str = Query(..., description="시군구 이름")
):
    region = get_region_by_name(sido, sigungu)
    if not region:
        raise HTTPException(status_code=404, detail="지정된 지역 정보가 region_dimension에 없습니다.")
    weather = await get_realtime_weather(region["id"], region["station_id"])
    return {"region": region, "weather": weather}


@app.get("/api/v1/weather/historical")
def get_historical_weather_api(
    sido: str = Query(..., description="시도 이름"),
    sigungu: str = Query(..., description="시군구 이름"),
    month: int = Query(..., description="월 (1~12)", ge=1, le=12),
    hour: int = Query(..., description="시간 (0~23)", ge=0, le=23)
):
    region = get_region_by_name(sido, sigungu)
    if not region:
        raise HTTPException(status_code=404, detail="지정된 지역 정보가 region_dimension에 없습니다.")
    historical = get_historical_weather(region["id"], month, hour)
    if not historical:
        return {
            "region": region, "month": month, "hour": hour,
            "avg_temp": 30.5, "avg_humidity": 72.0, "avg_pmv": 2.1,
            "source": "fallback_mock"
        }
    historical["source"] = "db"
    return {"region": region, "historical": historical}


@app.post("/api/v1/feedback")
def post_feedback(payload: FeedbackRequest):
    """피드백 수신 및 로깅. RLS 제한 시 인메모리 캐시로 폴백."""
    res = insert_user_feedback(
        user_id=payload.user_id,
        feedback_type=payload.feedback_type,
        pmv=payload.utci_calculated,   # UTCI 값을 pmv 컬럼에 저장 (스키마 재사용)
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


@app.post("/api/v1/recommend")
async def get_recommendation(payload: RecommendationRequest):
    """
    UTCI 기반 개인화 열쾌적도 계산 및 의복 추천 API (v3.0)
    """
    profile = payload.profile
    sido = payload.sido
    sigungu = payload.sigungu
    selected_hour = payload.selected_hour
    lang = (payload.lang or "ko").lower()
    if lang not in ("ko", "en", "ja"):
        lang = "ko"

    # ── 1. 지역 디멘전 조회 ──────────────────────────────
    region = get_region_by_name(sido, sigungu)
    if not region:
        region = {"id": 1, "nx": 61, "ny": 125, "station_id": 108}

    # ── 2. 날씨 데이터 수집 ──────────────────────────────
    current_hour = datetime.now().hour
    current_month = datetime.now().month

    is_historical = selected_hour is not None and selected_hour != current_hour
    weather_source = "realtime"

    if is_historical:
        historical_data = None
        try:
            historical_data = get_historical_weather(region["id"], current_month, selected_hour)
        except Exception as e:
            print(f"⚠️ Historical DB query failed: {e}")

        if historical_data:
            tdb = historical_data["avg_temp"]
            rh = historical_data["avg_humidity"]
        else:
            # 24시간 추정 폴백
            temp_by_hour = {
                0: 22.0, 1: 21.5, 2: 21.0, 3: 20.5, 4: 20.0, 5: 19.5,
                6: 20.0, 7: 21.5, 8: 23.0, 9: 24.5, 10: 26.0, 11: 27.5,
                12: 28.5, 13: 29.5, 14: 30.0, 15: 30.0, 16: 29.5, 17: 29.0,
                18: 28.0, 19: 27.0, 20: 26.0, 21: 25.0, 22: 24.0, 23: 23.0
            }
            hum_by_hour = {
                0: 80.0, 1: 82.0, 2: 83.0, 3: 84.0, 4: 85.0, 5: 85.0,
                6: 83.0, 7: 80.0, 8: 76.0, 9: 73.0, 10: 70.0, 11: 67.0,
                12: 64.0, 13: 62.0, 14: 60.0, 15: 60.0, 16: 61.0, 17: 63.0,
                18: 66.0, 19: 70.0, 20: 73.0, 21: 76.0, 22: 78.0, 23: 79.0
            }
            tdb = temp_by_hour.get(selected_hour, 26.0)
            rh = hum_by_hour.get(selected_hour, 70.0)

        is_outdoor = (profile.environment == "outdoor")
        v = 1.5 if is_outdoor else 0.1
        weather_source = "historical"
    else:
        weather = await get_realtime_weather(region["id"], region["station_id"])
        tdb = weather["temperature"]
        rh = weather["humidity"]
        is_outdoor = (profile.environment == "outdoor")
        v = weather["wind_speed"] if is_outdoor else 0.1
        weather_source = weather["source"]

    # ── 3. 개인화 생체 변수 환산 ──────────────────────────
    age = profile.age
    body_fat = profile.body_fat
    gender = profile.gender
    activity_level = profile.activity_level or "walking"

    bsa = compute_dubois_bsa(profile.weight, profile.height)
    met = compute_met_personalized(gender, body_fat, activity_level)

    # 평균 복사 온도(Tmrt) 추정
    tmrt = estimate_tmrt(tdb, is_outdoor, selected_hour)

    # ── 4. UTCI 기준값 계산 (순수 Python 다항식) ─────────
    try:
        utci_raw = round(calc_utci_raw(tdb=tdb, tr=tmrt, v=v, rh=rh), 2)
    except Exception as e:
        print(f"⚠️ UTCI 연산 에러: {e}. Fallback 추정값 사용.")
        utci_raw = round(tdb + (tmrt - tdb) * 0.35 - max(0, v - 0.5) * 2.0, 2)

    # ── 5. 개인화 오프셋 적용 ─────────────────────────────
    age_offset = compute_age_sensitivity_offset(age)
    fat_offset = compute_fat_sensitivity_offset(gender, body_fat)

    # 피드백 바이어스 (CLO 조정값 → UTCI 오프셋으로 환산)
    user_id = profile.user_id or "default_user"
    user_clo_bias = get_user_clo_bias_with_fallback(user_id)
    feedback_offset = user_clo_bias * -5.0  # CLO +0.1 ≈ UTCI -0.5°C 역산

    utci_personalized = round(utci_raw + age_offset + fat_offset + feedback_offset, 2)

    # ── 6. CLO 착의 추천량 산출 ──────────────────────────
    base_clo = compute_clo_from_utci(utci_personalized, gender)
    clo = round(max(0.1, base_clo + user_clo_bias), 2)

    print(
        f"🔬 UTCI 개인화: user={user_id}, age={age}, gender={gender}, bsa={bsa}, "
        f"met={met}, activity={activity_level}, "
        f"tdb={tdb}, tmrt={tmrt}, v={v}, rh={rh}, "
        f"utci_raw={utci_raw}, age_off={age_offset}, fat_off={fat_offset}, "
        f"fb_off={feedback_offset}, utci_p={utci_personalized}, clo={clo}"
    )

    # ── 7. UTCI 등급 분류 및 다국어 메시지 ──────────────
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
        },
        "ja": {
            "extreme_heat": ("極度の熱ストレス (>46°C)", ["吸汗速乾機能Tシャツ", "通気性リネンパンツ"], "生命に関わる熱環境です。直ちに屋外活動を中止し冷房へ避難してください。", "15分ごとに150ml以上の冷えたスポーツドリンクを摂取してください。"),
            "very_strong_heat": ("非常に強い熱ストレス (38~46°C)", ["軽い半袖Tシャツ", "薄手のリネンショーツ"], "日中の屋外活動は避け、必ず日陰で休憩してください。", "30分ごとに水分を補給してください。"),
            "strong_heat": ("強い熱ストレス (32~38°C)", ["薄手の半袖綿Tシャツ", "軽い綿パンツ"], "屋外活動を最小限にし、頻繁に休憩してください。", "毎時300ml以上の水分補給が必須です。"),
            "moderate_heat": ("普通の熱ストレス (26~32°C)", ["通常の半袖Tシャツ", "ジーンズまたは綿パンツ"], "風通しの良い環境を選んで活動してください。", "定期的な水分補給をお勧めします。"),
            "comfortable": ("熱的快適 (9~26°C)", ["快適な半袖または薄手の長袖", "軽いジーンズ"], "アウトドア活動に最適な天気です！", "普段通りの水分摂取を維持してください。"),
            "slight_cold": ("やや寒い (0~9°C)", ["薄手の長袖シャツ", "カーディガン"], "外出時は薄手のアウターをご持参ください。", "温かい飲み物を定期的に飲むことをお勧めします。"),
            "moderate_cold": ("普通の寒さ (-13~0°C)", ["長袖綿シャツ", "厚手のカーディガン"], "重ね着で体温を維持してください。", "温かいお茶や汁物を頻繁に摂取してください。"),
            "strong_cold": ("強い寒さ (-27∼-13°C)", ["セーター", "防風アウタージャケット"], "露出部位を最小限にし温かい室内にいてください。", "温かい食事と高カロリーの間食でエネルギーを維持してください。"),
            "extreme_cold": ("極度の寒さ (<-27°C)", ["厚手のダウンジャケット", "厚手のパンツ"], "屋外活動は控えてください。凍傷の危険があります。", "温かく高カロリーな食事を十分に摂ってください。"),
        },
    }

    # UTCI 등급 분류 (9단계, ISO TR 11769 기준)
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

    # ── 8. 아바타 메타데이터 ──────────────────────────────
    AVATAR_METADATA = {
        "extreme_heat":      {"avatar_state": "sweating",     "clothing_codes": ["active_tee", "linen_shorts"]},
        "very_strong_heat":  {"avatar_state": "sweating",     "clothing_codes": ["active_tee", "linen_shorts"]},
        "strong_heat":       {"avatar_state": "hot",          "clothing_codes": ["short_sleeve_tee", "cotton_pants"]},
        "moderate_heat":     {"avatar_state": "slightly_hot", "clothing_codes": ["cotton_shirt", "slacks"]},
        "comfortable":       {"avatar_state": "comfortable",  "clothing_codes": ["comfortable_tee", "jeans"]},
        "slight_cold":       {"avatar_state": "slightly_cold","clothing_codes": ["long_sleeve", "cardigan", "trousers"]},
        "moderate_cold":     {"avatar_state": "cold",         "clothing_codes": ["long_sleeve_shirt", "warm_cardigan", "heavy_pants"]},
        "strong_cold":       {"avatar_state": "shivering",    "clothing_codes": ["sweater", "heavy_jacket", "heavy_pants"]},
        "extreme_cold":      {"avatar_state": "shivering",    "clothing_codes": ["sweater", "heavy_jacket", "heavy_pants"]},
    }

    meta = AVATAR_METADATA.get(utci_key, {"avatar_state": "comfortable", "clothing_codes": ["comfortable_tee", "jeans"]})

    return {
        "utci": utci_raw,
        "utci_personalized": utci_personalized,
        "utci_category": utci_key,
        "thermal_sensation": thermal_sensation,
        # 하위 호환성: pmv 필드는 utci_personalized로 대체 반환
        "pmv": utci_personalized,
        "weather": {
            "temperature": tdb,
            "humidity": rh,
            "wind_speed": v,
            "tmrt": tmrt,
            "source": weather_source
        },
        "body_params": {
            "bsa": bsa,
            "met": met,
            "age_offset": age_offset,
            "fat_offset": fat_offset,
        },
        "recommendations": {
            "clothing": clothing,
            "activity": activity,
            "hydration": hydration,
            "user_clo_bias": user_clo_bias,
            "clo_applied": clo,
            "met_applied": met,
            "avatar_state": meta["avatar_state"],
            "clothing_codes": meta["clothing_codes"]
        }
    }
