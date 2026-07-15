import os
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
from supabase import create_client, Client
from typing import Optional, Dict, Any, List

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
# Prefer the explicit project-scoped name; retain SERVICE_ROLE_KEY compatibility
# for existing deployment environments.
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in environment variables.")

# Supabase Client Initialization
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def get_user_scoped_client(access_token: str) -> Client:
    """Create an isolated client whose database requests are evaluated by RLS.

    A module-level client must not be re-authenticated per request: doing so could
    leak one user's JWT into another concurrent request.  This short-lived client
    keeps the caller's JWT local to the request and lets Supabase RLS enforce
    ownership for the new account tables.
    """
    client: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    client.postgrest.auth(access_token)
    return client


def get_admin_client() -> Optional[Client]:
    """Return a server-only Supabase admin client when deletion is configured."""
    if not SUPABASE_SERVICE_ROLE_KEY:
        return None
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def get_weather_cache_client() -> Client:
    """Return the server-only client used for shared forecast-cache persistence."""
    client = get_admin_client()
    if client is None:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is required for weather cache access.")
    return client


def get_phase1_profile(access_token: str, user_id: str) -> Optional[Dict[str, Any]]:
    """Read the authenticated user's Phase 1 personalization profile."""
    try:
        response = get_user_scoped_client(access_token).table("profiles") \
            .select("*") \
            .eq("user_id", user_id) \
            .maybe_single() \
            .execute()
        return response.data
    except Exception as exc:
        print(f"Debug [get_phase1_profile]: {exc}")
        return None


def upsert_phase1_profile(access_token: str, user_id: str, profile_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Upsert a profile under the caller's RLS-scoped Supabase client."""
    try:
        payload = {"user_id": user_id, **profile_data}
        response = get_user_scoped_client(access_token).table("profiles") \
            .upsert(payload, on_conflict="user_id") \
            .execute()
        return response.data[0] if response.data else payload
    except Exception as exc:
        print(f"Debug [upsert_phase1_profile]: {exc}")
        return None


def get_phase1_consents(access_token: str, user_id: str) -> List[Dict[str, Any]]:
    """Read the authenticated user's latest consent records."""
    try:
        response = get_user_scoped_client(access_token).table("user_consents") \
            .select("consent_type, policy_version, granted_at, revoked_at, updated_at") \
            .eq("user_id", user_id) \
            .order("consent_type") \
            .execute()
        return response.data or []
    except Exception as exc:
        print(f"Debug [get_phase1_consents]: {exc}")
        return []


def upsert_phase1_consents(
    access_token: str,
    user_id: str,
    policy_version: str,
    choices: Dict[str, bool],
) -> Optional[List[Dict[str, Any]]]:
    """Record the current terms, privacy, and optional marketing choices."""
    try:
        changed_at = datetime.now(timezone.utc).isoformat()
        records = []
        for consent_type, granted in choices.items():
            records.append({
                "user_id": user_id,
                "consent_type": consent_type,
                "policy_version": policy_version,
                "granted_at": changed_at if granted else None,
                "revoked_at": None if granted else changed_at,
            })
        response = get_user_scoped_client(access_token).table("user_consents") \
            .upsert(records, on_conflict="user_id,consent_type") \
            .execute()
        return response.data or records
    except Exception as exc:
        print(f"Debug [upsert_phase1_consents]: {exc}")
        return None


def get_wardrobe_items(access_token: str, user_id: str) -> List[Dict[str, Any]]:
    try:
        response = get_user_scoped_client(access_token).table("wardrobe_items") \
            .select("*") \
            .eq("user_id", user_id) \
            .eq("archived", False) \
            .order("created_at", desc=True) \
            .execute()
        return response.data or []
    except Exception as exc:
        print(f"Debug [get_wardrobe_items]: {exc}")
        return []


def create_wardrobe_item(access_token: str, user_id: str, item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    try:
        response = get_user_scoped_client(access_token).table("wardrobe_items") \
            .insert({"user_id": user_id, **item}) \
            .execute()
        return response.data[0] if response.data else None
    except Exception as exc:
        print(f"Debug [create_wardrobe_item]: {exc}")
        return None


def archive_wardrobe_item(access_token: str, user_id: str, item_id: str) -> bool:
    try:
        response = get_user_scoped_client(access_token).table("wardrobe_items") \
            .update({"archived": True}) \
            .eq("id", item_id) \
            .eq("user_id", user_id) \
            .execute()
        return bool(response.data)
    except Exception as exc:
        print(f"Debug [archive_wardrobe_item]: {exc}")
        return False


def update_wardrobe_item(access_token: str, user_id: str, item_id: str, changes: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    try:
        response = get_user_scoped_client(access_token).table("wardrobe_items") \
            .update(changes).eq("id", item_id).eq("user_id", user_id).eq("archived", False).execute()
        return response.data[0] if response.data else None
    except Exception as exc:
        print(f"Debug [update_wardrobe_item]: {exc}")
        return None


def get_user_locations(access_token: str, user_id: str) -> List[Dict[str, Any]]:
    try:
        response = get_user_scoped_client(access_token).table("user_locations") \
            .select("*").eq("user_id", user_id).order("is_favorite", desc=True).order("created_at", desc=True).execute()
        return response.data or []
    except Exception as exc:
        print(f"Debug [get_user_locations]: {exc}")
        return []


def create_user_location(access_token: str, user_id: str, location: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    try:
        response = get_user_scoped_client(access_token).table("user_locations") \
            .insert({"user_id": user_id, **location}).execute()
        return response.data[0] if response.data else None
    except Exception as exc:
        print(f"Debug [create_user_location]: {exc}")
        return None


def update_user_location(access_token: str, user_id: str, location_id: str, changes: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    try:
        response = get_user_scoped_client(access_token).table("user_locations") \
            .update(changes).eq("id", location_id).eq("user_id", user_id).execute()
        return response.data[0] if response.data else None
    except Exception as exc:
        print(f"Debug [update_user_location]: {exc}")
        return None


def delete_user_location(access_token: str, user_id: str, location_id: str) -> bool:
    try:
        response = get_user_scoped_client(access_token).table("user_locations") \
            .delete().eq("id", location_id).eq("user_id", user_id).execute()
        return bool(response.data)
    except Exception as exc:
        print(f"Debug [delete_user_location]: {exc}")
        return False


def create_recommendation_feedback(access_token: str, user_id: str, feedback: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    try:
        response = get_user_scoped_client(access_token).table("recommendation_feedback") \
            .insert({"user_id": user_id, **feedback}) \
            .execute()
        return response.data[0] if response.data else None
    except Exception as exc:
        print(f"Debug [create_recommendation_feedback]: {exc}")
        return None


def get_recommendation_feedback_warmth_bias(access_token: str, user_id: str) -> float:
    """Return a small, explainable warmth adjustment from the latest feedback."""
    try:
        rows = get_user_scoped_client(access_token).table("recommendation_feedback") \
            .select("feedback_type") \
            .eq("user_id", user_id) \
            .order("created_at", desc=True).limit(12).execute().data or []
        if not rows:
            return 0.0
        values = {"too_cold": 1.0, "comfortable": 0.0, "too_hot": -1.0}
        return round(max(-1.0, min(1.0, sum(values.get(row["feedback_type"], 0.0) for row in rows) / len(rows))), 2)
    except Exception as exc:
        print(f"Debug [get_recommendation_feedback_warmth_bias]: {exc}")
        return 0.0


def clear_recommendation_feedback(access_token: str, user_id: str) -> bool:
    try:
        get_user_scoped_client(access_token).table("recommendation_feedback") \
            .delete().eq("user_id", user_id).execute()
        return True
    except Exception as exc:
        print(f"Debug [clear_recommendation_feedback]: {exc}")
        return False


def clear_recommendation_feedback(access_token: str, user_id: str) -> bool:
    try:
        get_user_scoped_client(access_token).table("recommendation_feedback") \
            .delete().eq("user_id", user_id).execute()
        return True
    except Exception as exc:
        print(f"Debug [clear_recommendation_feedback]: {exc}")
        return False


def export_user_data(access_token: str, user_id: str) -> Dict[str, Any]:
    """Assemble the caller's RLS-protected personal data into a JSON export."""
    client = get_user_scoped_client(access_token)
    try:
        profile = client.table("profiles").select("*").eq("user_id", user_id).maybe_single().execute().data
        consents = client.table("user_consents").select("*").eq("user_id", user_id).order("consent_type").execute().data or []
        wardrobe = client.table("wardrobe_items").select("*").eq("user_id", user_id).order("created_at", desc=True).execute().data or []
        feedback = client.table("recommendation_feedback").select("*").eq("user_id", user_id).order("created_at", desc=True).execute().data or []
        return {
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "profile": profile,
            "consents": consents,
            "wardrobe_items": wardrobe,
            "recommendation_feedback": feedback,
        }
    except Exception as exc:
        print(f"Debug [export_user_data]: {exc}")
        return {}


def get_account_deletion_request(access_token: str, user_id: str) -> Optional[Dict[str, Any]]:
    try:
        return get_user_scoped_client(access_token).table("account_deletion_requests") \
            .select("requested_at, scheduled_delete_at, cancelled_at, executed_at") \
            .eq("user_id", user_id).maybe_single().execute().data
    except Exception as exc:
        print(f"Debug [get_account_deletion_request]: {exc}")
        return None


def request_account_deletion(access_token: str, user_id: str) -> Optional[Dict[str, Any]]:
    try:
        now = datetime.now(timezone.utc)
        payload = {
            "user_id": user_id,
            "requested_at": now.isoformat(),
            "scheduled_delete_at": (now + timedelta(days=30)).isoformat(),
            "cancelled_at": None,
            "executed_at": None,
        }
        response = get_user_scoped_client(access_token).table("account_deletion_requests") \
            .upsert(payload, on_conflict="user_id").execute()
        return response.data[0] if response.data else payload
    except Exception as exc:
        print(f"Debug [request_account_deletion]: {exc}")
        return None


def cancel_account_deletion(access_token: str, user_id: str) -> bool:
    try:
        response = get_user_scoped_client(access_token).table("account_deletion_requests") \
            .update({"cancelled_at": datetime.now(timezone.utc).isoformat()}) \
            .eq("user_id", user_id).is_("executed_at", "null").execute()
        return bool(response.data)
    except Exception as exc:
        print(f"Debug [cancel_account_deletion]: {exc}")
        return False


def execute_due_account_deletions() -> int:
    """Delete expired accounts with the server-only service key; return count."""
    admin = get_admin_client()
    if admin is None:
        print("⚠️ Account deletion worker skipped: SUPABASE_SERVICE_ROLE_KEY is not configured.")
        return 0
    try:
        due = admin.table("account_deletion_requests") \
            .select("user_id") \
            .lte("scheduled_delete_at", datetime.now(timezone.utc).isoformat()) \
            .is_("cancelled_at", "null").is_("executed_at", "null").execute().data or []
        completed = 0
        for request in due:
            user_id = request["user_id"]
            try:
                admin.auth.admin.delete_user(user_id)
                completed += 1
            except Exception as exc:
                print(f"⚠️ Account deletion failed for {user_id}: {exc}")
        return completed
    except Exception as exc:
        print(f"⚠️ Account deletion worker failed: {exc}")
        return 0

# 전국 거점 위경도 매핑 딕셔너리 (Fallback 및 Seeding용)
REGIONAL_GPS_FALLBACK = {
    "강남구": (37.5172, 127.0473),
    "서초구": (37.4836, 127.0327),
    "송파구": (37.5145, 127.1059),
    "마포구": (37.5638, 126.9084),
    "종로구": (37.5735, 126.979),
    "영등포구": (37.5264, 126.8962),
    "관악구": (37.4784, 126.9516),
    "동작구": (37.5124, 126.9392),
    "용산구": (37.5326, 126.9904),
    "성동구": (37.5635, 127.0365),
    "광진구": (37.5385, 127.0824),
    "동대문구": (37.5744, 127.04),
    "중랑구": (37.6065, 127.0927),
    "성북구": (37.5891, 127.0182),
    "강북구": (37.6396, 127.0257),
    "도봉구": (37.6688, 127.0471),
    "노원구": (37.6542, 127.0568),
    "은평구": (37.6027, 126.9291),
    "서대문구": (37.5791, 126.9368),
    "양천구": (37.5169, 126.8665),
    "강서구": (37.5509, 126.8497),
    "구로구": (37.4954, 126.8874),
    "금천구": (37.457, 126.8957),
    "강동구": (37.5302, 127.1238),
    "중구": (37.5636, 126.9976),
    "수원시": (37.2636, 127.0286),
    "성남시": (37.4449, 127.1389),
    "고양시": (37.6584, 126.832),
    "용인시": (37.241, 127.1779),
    "부천시": (37.4893, 126.7826),
    "안산시": (37.3219, 126.8308),
    "안양시": (37.3897, 126.9535),
    "남양주시": (37.636, 127.2165),
    "화성시": (37.1995, 126.8315),
    "평택시": (36.9921, 127.1128),
    "의정부시": (37.7381, 127.0337),
    "시흥시": (37.3801, 126.803),
    "김포시": (37.6152, 126.7156),
    "광명시": (37.4785, 126.8647),
    "파주시": (37.76, 126.78),
    "군포시": (37.3617, 126.9353),
    "광주시": (37.4294, 127.2551),
    "이천시": (37.2723, 127.4418),
    "양주시": (37.7853, 127.0457),
    "구리시": (37.5943, 127.1296),
    "안성시": (37.008, 127.2797),
    "포천시": (37.8949, 127.2067),
    "의왕시": (37.3449, 126.9683),
    "하남시": (37.5393, 127.2148),
    "여주시": (37.2984, 127.6371),
    "중구": (37.4728, 126.6238),
    "남동구": (37.4469, 126.7315),
    "부평구": (37.5071, 126.7219),
    "서구": (37.5451, 126.676),
    "연수구": (37.4101, 126.6783),
    "해운대구": (35.1631, 129.1636),
    "부산진구": (35.1601, 129.0567),
    "동래구": (35.2048, 129.0838),
    "사하구": (35.1044, 128.9675),
    "금정구": (35.2427, 129.0924),
    "중구": (35.8694, 128.6062),
    "수성구": (35.8569, 128.63),
    "달서구": (35.8277, 128.5348),
    "동구": (35.1461, 126.9231),
    "북구": (35.195, 126.909),
    "서구": (35.152, 126.89),
    "중구": (36.325, 127.4208),
    "서구": (36.333, 127.369),
    "유성구": (36.362, 127.356),
    "남구": (35.5437, 129.33),
    "세종시": (36.48, 127.289),
    "제주시": (33.5006, 126.5312),
    "서귀포시": (33.2541, 126.5601),
    "춘천시": (37.8813, 127.7298),
    "강릉시": (37.7518, 128.8761),
    "청주시": (36.6372, 127.4897),
    "천안시": (36.815, 127.1139),
    "전주시": (35.8242, 127.148),
    "목포시": (34.8118, 126.3922),
    "포항시": (36.019, 129.3434),
    "창원시": (35.228, 128.6811),
    "김해시": (35.234, 128.881)
}

SEED_LOCATIONS = [
    {"id": 1, "sido": "서울특별시", "sigungu": "강남구", "latitude": 37.5172, "longitude": 127.0473},
    {"id": 2, "sido": "서울특별시", "sigungu": "서초구", "latitude": 37.4836, "longitude": 127.0327},
    {"id": 3, "sido": "서울특별시", "sigungu": "송파구", "latitude": 37.5145, "longitude": 127.1059},
    {"id": 4, "sido": "서울특별시", "sigungu": "마포구", "latitude": 37.5638, "longitude": 126.9084},
    {"id": 5, "sido": "서울특별시", "sigungu": "종로구", "latitude": 37.5735, "longitude": 126.979},
    {"id": 6, "sido": "서울특별시", "sigungu": "영등포구", "latitude": 37.5264, "longitude": 126.8962},
    {"id": 7, "sido": "서울특별시", "sigungu": "관악구", "latitude": 37.4784, "longitude": 126.9516},
    {"id": 8, "sido": "서울특별시", "sigungu": "동작구", "latitude": 37.5124, "longitude": 126.9392},
    {"id": 9, "sido": "서울특별시", "sigungu": "용산구", "latitude": 37.5326, "longitude": 126.9904},
    {"id": 10, "sido": "서울특별시", "sigungu": "성동구", "latitude": 37.5635, "longitude": 127.0365},
    {"id": 11, "sido": "서울특별시", "sigungu": "광진구", "latitude": 37.5385, "longitude": 127.0824},
    {"id": 12, "sido": "서울특별시", "sigungu": "동대문구", "latitude": 37.5744, "longitude": 127.04},
    {"id": 13, "sido": "서울특별시", "sigungu": "중랑구", "latitude": 37.6065, "longitude": 127.0927},
    {"id": 14, "sido": "서울특별시", "sigungu": "성북구", "latitude": 37.5891, "longitude": 127.0182},
    {"id": 15, "sido": "서울특별시", "sigungu": "강북구", "latitude": 37.6396, "longitude": 127.0257},
    {"id": 16, "sido": "서울특별시", "sigungu": "도봉구", "latitude": 37.6688, "longitude": 127.0471},
    {"id": 17, "sido": "서울특별시", "sigungu": "노원구", "latitude": 37.6542, "longitude": 127.0568},
    {"id": 18, "sido": "서울특별시", "sigungu": "은평구", "latitude": 37.6027, "longitude": 126.9291},
    {"id": 19, "sido": "서울특별시", "sigungu": "서대문구", "latitude": 37.5791, "longitude": 126.9368},
    {"id": 20, "sido": "서울특별시", "sigungu": "양천구", "latitude": 37.5169, "longitude": 126.8665},
    {"id": 21, "sido": "서울특별시", "sigungu": "강서구", "latitude": 37.5509, "longitude": 126.8497},
    {"id": 22, "sido": "서울특별시", "sigungu": "구로구", "latitude": 37.4954, "longitude": 126.8874},
    {"id": 23, "sido": "서울특별시", "sigungu": "금천구", "latitude": 37.457, "longitude": 126.8957},
    {"id": 24, "sido": "서울특별시", "sigungu": "강동구", "latitude": 37.5302, "longitude": 127.1238},
    {"id": 25, "sido": "서울특별시", "sigungu": "중구", "latitude": 37.5636, "longitude": 126.9976},
    {"id": 26, "sido": "경기도", "sigungu": "수원시", "latitude": 37.2636, "longitude": 127.0286},
    {"id": 27, "sido": "경기도", "sigungu": "성남시", "latitude": 37.4449, "longitude": 127.1389},
    {"id": 28, "sido": "경기도", "sigungu": "고양시", "latitude": 37.6584, "longitude": 126.832},
    {"id": 29, "sido": "경기도", "sigungu": "용인시", "latitude": 37.241, "longitude": 127.1779},
    {"id": 30, "sido": "경기도", "sigungu": "부천시", "latitude": 37.4893, "longitude": 126.7826},
    {"id": 31, "sido": "경기도", "sigungu": "안산시", "latitude": 37.3219, "longitude": 126.8308},
    {"id": 32, "sido": "경기도", "sigungu": "안양시", "latitude": 37.3897, "longitude": 126.9535},
    {"id": 33, "sido": "경기도", "sigungu": "남양주시", "latitude": 37.636, "longitude": 127.2165},
    {"id": 34, "sido": "경기도", "sigungu": "화성시", "latitude": 37.1995, "longitude": 126.8315},
    {"id": 35, "sido": "경기도", "sigungu": "평택시", "latitude": 36.9921, "longitude": 127.1128},
    {"id": 36, "sido": "경기도", "sigungu": "의정부시", "latitude": 37.7381, "longitude": 127.0337},
    {"id": 37, "sido": "경기도", "sigungu": "시흥시", "latitude": 37.3801, "longitude": 126.803},
    {"id": 38, "sido": "경기도", "sigungu": "김포시", "latitude": 37.6152, "longitude": 126.7156},
    {"id": 39, "sido": "경기도", "sigungu": "광명시", "latitude": 37.4785, "longitude": 126.8647},
    {"id": 40, "sido": "경기도", "sigungu": "파주시", "latitude": 37.76, "longitude": 126.78},
    {"id": 41, "sido": "경기도", "sigungu": "군포시", "latitude": 37.3617, "longitude": 126.9353},
    {"id": 42, "sido": "경기도", "sigungu": "광주시", "latitude": 37.4294, "longitude": 127.2551},
    {"id": 43, "sido": "경기도", "sigungu": "이천시", "latitude": 37.2723, "longitude": 127.4418},
    {"id": 44, "sido": "경기도", "sigungu": "양주시", "latitude": 37.7853, "longitude": 127.0457},
    {"id": 45, "sido": "경기도", "sigungu": "구리시", "latitude": 37.5943, "longitude": 127.1296},
    {"id": 46, "sido": "경기도", "sigungu": "안성시", "latitude": 37.008, "longitude": 127.2797},
    {"id": 47, "sido": "경기도", "sigungu": "포천시", "latitude": 37.8949, "longitude": 127.2067},
    {"id": 48, "sido": "경기도", "sigungu": "의왕시", "latitude": 37.3449, "longitude": 126.9683},
    {"id": 49, "sido": "경기도", "sigungu": "하남시", "latitude": 37.5393, "longitude": 127.2148},
    {"id": 50, "sido": "경기도", "sigungu": "여주시", "latitude": 37.2984, "longitude": 127.6371},
    {"id": 51, "sido": "인천광역시", "sigungu": "중구", "latitude": 37.4728, "longitude": 126.6238},
    {"id": 52, "sido": "인천광역시", "sigungu": "남동구", "latitude": 37.4469, "longitude": 126.7315},
    {"id": 53, "sido": "인천광역시", "sigungu": "부평구", "latitude": 37.5071, "longitude": 126.7219},
    {"id": 54, "sido": "인천광역시", "sigungu": "서구", "latitude": 37.5451, "longitude": 126.676},
    {"id": 55, "sido": "인천광역시", "sigungu": "연수구", "latitude": 37.4101, "longitude": 126.6783},
    {"id": 56, "sido": "부산광역시", "sigungu": "해운대구", "latitude": 35.1631, "longitude": 129.1636},
    {"id": 57, "sido": "부산광역시", "sigungu": "부산진구", "latitude": 35.1601, "longitude": 129.0567},
    {"id": 58, "sido": "부산광역시", "sigungu": "동래구", "latitude": 35.2048, "longitude": 129.0838},
    {"id": 59, "sido": "부산광역시", "sigungu": "사하구", "latitude": 35.1044, "longitude": 128.9675},
    {"id": 60, "sido": "부산광역시", "sigungu": "금정구", "latitude": 35.2427, "longitude": 129.0924},
    {"id": 61, "sido": "대구광역시", "sigungu": "중구", "latitude": 35.8694, "longitude": 128.6062},
    {"id": 62, "sido": "대구광역시", "sigungu": "수성구", "latitude": 35.8569, "longitude": 128.63},
    {"id": 63, "sido": "대구광역시", "sigungu": "달서구", "latitude": 35.8277, "longitude": 128.5348},
    {"id": 64, "sido": "광주광역시", "sigungu": "동구", "latitude": 35.1461, "longitude": 126.9231},
    {"id": 65, "sido": "광주광역시", "sigungu": "북구", "latitude": 35.195, "longitude": 126.909},
    {"id": 66, "sido": "광주광역시", "sigungu": "서구", "latitude": 35.152, "longitude": 126.89},
    {"id": 67, "sido": "대전광역시", "sigungu": "중구", "latitude": 36.325, "longitude": 127.4208},
    {"id": 68, "sido": "대전광역시", "sigungu": "서구", "latitude": 36.333, "longitude": 127.369},
    {"id": 69, "sido": "대전광역시", "sigungu": "유성구", "latitude": 36.362, "longitude": 127.356},
    {"id": 70, "sido": "울산광역시", "sigungu": "남구", "latitude": 35.5437, "longitude": 129.33},
    {"id": 71, "sido": "세종특별자치시", "sigungu": "세종시", "latitude": 36.48, "longitude": 127.289},
    {"id": 72, "sido": "제주특별자치도", "sigungu": "제주시", "latitude": 33.5006, "longitude": 126.5312},
    {"id": 73, "sido": "제주특별자치도", "sigungu": "서귀포시", "latitude": 33.2541, "longitude": 126.5601},
    {"id": 74, "sido": "강원특별자치도", "sigungu": "춘천시", "latitude": 37.8813, "longitude": 127.7298},
    {"id": 75, "sido": "강원특별자치도", "sigungu": "강릉시", "latitude": 37.7518, "longitude": 128.8761},
    {"id": 76, "sido": "충청북도", "sigungu": "청주시", "latitude": 36.6372, "longitude": 127.4897},
    {"id": 77, "sido": "충청남도", "sigungu": "천안시", "latitude": 36.815, "longitude": 127.1139},
    {"id": 78, "sido": "전라북도", "sigungu": "전주시", "latitude": 35.8242, "longitude": 127.148},
    {"id": 79, "sido": "전라남도", "sigungu": "목포시", "latitude": 34.8118, "longitude": 126.3922},
    {"id": 80, "sido": "경상북도", "sigungu": "포항시", "latitude": 36.019, "longitude": 129.3434},
    {"id": 81, "sido": "경상남도", "sigungu": "창원시", "latitude": 35.228, "longitude": 128.6811},
    {"id": 82, "sido": "경상남도", "sigungu": "김해시", "latitude": 35.234, "longitude": 128.881}
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
    # DB 조회 시도
    db_locs = _get_all_locations_raw()
    
    # 중복 제거 병합용 set/dict 구성
    merged_map = {}
    
    # 1. 로컬 82개 전국 핵심 거점을 기본으로 깔아둠
    for loc in SEED_LOCATIONS:
        key = (loc["sido"], loc["sigungu"])
        merged_map[key] = {
            "sido": loc["sido"],
            "sigungu": loc["sigungu"],
            "latitude": loc["latitude"],
            "longitude": loc["longitude"]
        }
        
    # 2. DB에서 추가로 읽은 거점이 있다면 덮어쓰기 병합
    for loc in db_locs:
        key = (loc["sido"], loc["sigungu"])
        merged_map[key] = {
            "sido": loc["sido"],
            "sigungu": loc["sigungu"],
            "latitude": loc["latitude"],
            "longitude": loc["longitude"]
        }
        
    # 시도/시군구 정렬하여 반환
    result = list(merged_map.values())
    result.sort(key=lambda x: (x["sido"], x["sigungu"]))
    return result

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
    # DB 조회 시도
    db_locs = _get_all_location_coordinates_raw()
    
    merged_map = {}
    
    # 1. 로컬 82개 전국 핵심 거점 정보를 기본으로 로드
    for loc in SEED_LOCATIONS:
        key = (loc["sido"], loc["sigungu"])
        merged_map[key] = {
            "id": loc["id"],
            "sido": loc["sido"],
            "sigungu": loc["sigungu"],
            "latitude": loc["latitude"],
            "longitude": loc["longitude"]
        }
        
    # 2. DB에서 로드된 거점이 있다면 덮어쓰기 병합 (DB id 우선 적용)
    for loc in db_locs:
        key = (loc["sido"], loc["sigungu"])
        merged_map[key] = {
            "id": loc["id"],
            "sido": loc["sido"],
            "sigungu": loc["sigungu"],
            "latitude": loc["latitude"],
            "longitude": loc["longitude"]
        }
        
    return list(merged_map.values())

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
        response = get_weather_cache_client().table("weather_forecast_cache") \
            .select("*") \
            .eq("location_id", location_id) \
            .eq("forecast_date", date_str) \
            .execute()
            
        if response.data and len(response.data) > 0:
            return response.data[0]
    except Exception as exc:
        print(f"ERROR [weather_forecast_cache read]: {exc}")
    return None

def upsert_weather_forecast_cache(location_id: int, date_str: str, hourly_data: Dict[str, Any]) -> Optional[Any]:
    try:
        data = {
            "location_id": location_id,
            "forecast_date": date_str,
            "hourly_data": hourly_data
        }
        response = get_weather_cache_client().table("weather_forecast_cache") \
            .upsert(data, on_conflict="location_id") \
            .execute()
        return response.data
    except Exception as exc:
        print(f"ERROR [weather_forecast_cache upsert]: {exc}")
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


def seed_all_locations_into_db() -> int:
    """db_client에 정의된 SEED_LOCATIONS 82개 전국 거점을 location_dimension 테이블에 동기화 시딩합니다."""
    success_count = 0
    print(f"📡 [Seeder] Starting DB synchronization for {len(SEED_LOCATIONS)} locations...")
    for loc in SEED_LOCATIONS:
        db_data = {
            "sido": loc["sido"],
            "sigungu": loc["sigungu"],
            "latitude": loc["latitude"],
            "longitude": loc["longitude"]
        }
        try:
            supabase.table("location_dimension").upsert(
                db_data, 
                on_conflict="sido,sigungu"
            ).execute()
            success_count += 1
        except Exception as e:
            print(f"⚠️ [Seeder] Failed to seed location {loc['sido']} {loc['sigungu']}: {e}")
    print(f"✅ [Seeder] Seeding finished. {success_count}/{len(SEED_LOCATIONS)} locations synced in DB.")
    return success_count



