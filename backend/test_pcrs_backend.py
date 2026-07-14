import sys
import os
import asyncio

# Setup path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from db_client import get_all_location_coordinates
from weather_client import fetch_weather_forecast_from_api

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
            print(f"Sample Relative Humidity (Hour 0): {data['relativehumidity_2m'][0]}%")
            print(f"Sample Wind Speed (Hour 0): {data['windspeed_10m'][0]}m/s")
            print(f"Sample Solar Radiation (Hour 0): {data['shortwave_radiation'][0]}W/m2")
            return True
        else:
            print("ERROR: Open-Meteo response invalid or empty.")
            return False
    except Exception as e:
        # Avoid non-ascii characters in exception printout
        err_msg = str(e).encode('ascii', 'ignore').decode('ascii')
        print(f"ERROR: Open-Meteo Fetch exception: {err_msg}")
        return False

async def main():
    print("=== STARTING PCRS BACKEND INTEGRATION TEST ===")
    db_ok = await test_supabase_db()
    api_ok = await test_open_meteo_api()
    
    print("\n=== INTEGRATION TEST SUMMARY ===")
    if db_ok and api_ok:
        print("RESULT: ALL TESTS PASSED SUCCESSFULLY!")
    else:
        print("RESULT: FAILURE IN INTEGRATION TESTING. Please check logs.")

if __name__ == "__main__":
    asyncio.run(main())
