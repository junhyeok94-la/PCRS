import sys
import os
import asyncio
from fastapi.testclient import TestClient

# Windows 콘솔 한글 및 이모지 출력 시 cp949 인코딩 오류 방지
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except AttributeError:
        pass

# Setup path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from db_client import get_all_location_coordinates
from weather_client import fetch_weather_forecast_from_api
from main import app

client = TestClient(app)

async def test_supabase_db():
    print("[1] TESTING SUPABASE DATABASE CONNECTION...")
    try:
        locations = get_all_location_coordinates()
        print("SUCCESS: Connected to Supabase DB.")
        print(f"Retrieved {len(locations)} locations.")
        for idx, loc in enumerate(locations[:3]):
            print(f"  - Location {idx+1}: {loc.get('sido')} {loc.get('sigungu')} (Lat: {loc.get('latitude')}, Lon: {loc.get('longitude')})")
        return len(locations) > 0
    except Exception as e:
        print(f"ERROR: Supabase connection failed: {str(e)}")
        return False

async def test_open_meteo_api():
    print("\n[2] TESTING OPEN-METEO WEATHER API...")
    try:
        # Yeongdeungpo coordinate test
        data = await fetch_weather_forecast_from_api(37.5264, 126.8962)
        if data and "temperature_2m" in data:
            print("SUCCESS: Weather data fetched from Open-Meteo API.")
            print(f"Current forecast temp array length: {len(data['temperature_2m'])} hours.")
            print(f"Sample Temperature (Hour 0): {data['temperature_2m'][0]}C")
            return True
        else:
            print("ERROR: Open-Meteo response invalid or empty.")
            return False
    except Exception as e:
        err_msg = str(e).encode('ascii', 'ignore').decode('ascii')
        print(f"ERROR: Open-Meteo Fetch exception: {err_msg}")
        return False

def test_fastapi_endpoints():
    print("\n[3] TESTING FASTAPI API ENDPOINTS (TestClient)...")
    try:
        # 1. Health Check
        print("  - Testing GET /health...")
        res = client.get("/health")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        assert res.json().get("status") == "ok"
        print("    => OK")

        # 2. Regions
        print("  - Testing GET /api/v1/regions...")
        res = client.get("/api/v1/regions")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        assert "regions" in res.json()
        print("    => OK")

        # 3. Retired legacy routes are explicitly unavailable.
        print("  - Testing retired legacy routes...")
        profile_data = {
            "user_id": "test_user_99",
            "height": 175.5,
            "weight": 70.0,
            "age": 28,
            "body_fat": 15.0,
            "gender": "male",
            "environment": "outdoor",
            "activity_level": "cycling"
        }
        assert client.post("/api/v1/profile", json=profile_data).status_code == 410
        assert client.get("/api/v1/profile", params={"user_id": "test_user_99"}).status_code == 410
        assert client.post("/api/v1/feedback", json={}).status_code == 422
        print("    => OK")

        # 4. Recommendation
        print("  - Testing POST /api/v1/recommend...")
        recommend_payload = {
            "profile": profile_data,
            "latitude": 37.5264,
            "longitude": 126.8962,
            "lang": "ko"
        }
        res_rec = client.post("/api/v1/recommend", json=recommend_payload)
        assert res_rec.status_code == 200, f"Recommendation failed: {res_rec.text}"
        data = res_rec.json()
        assert "mapped_location" in data
        assert "utci" in data
        assert "utci_personalized" in data
        assert "recommendations" in data
        assert "nudge" in data
        
        # 개인화 계산 및 넛지 검증
        nudge = data["nudge"]
        print(f"    - Mapped Location: {data['mapped_location']['sido']} {data['mapped_location']['sigungu']}")
        print(f"    - UTCI (Public): {data['utci']}C, UTCI (Personalized): {data['utci_personalized']}C")
        print(f"    - Nudge Warning Active: {nudge['nudge_warning']}")
        if nudge["nudge_warning"]:
            print(f"    - Nudge Message: {nudge['nudge_message']}")
        print("    => OK")

        print("SUCCESS: All FastAPI endpoint tests passed.")
        return True
    except Exception as e:
        print(f"ERROR: FastAPI endpoints test failed: {str(e)}")
        return False

async def main():
    print("=== STARTING PCRS BACKEND INTEGRATION TEST ===")
    db_ok = await test_supabase_db()
    api_ok = await test_open_meteo_api()
    endpoints_ok = test_fastapi_endpoints()
    
    print("\n=== INTEGRATION TEST SUMMARY ===")
    if db_ok and api_ok and endpoints_ok:
        print("RESULT: ALL TESTS PASSED SUCCESSFULLY!")
    else:
        print("RESULT: FAILURE IN INTEGRATION TESTING. Please check logs.")

if __name__ == "__main__":
    asyncio.run(main())
