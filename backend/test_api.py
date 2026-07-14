import urllib.request
import json

url = "http://localhost:8001/api/v1/recommend"
data = {
    "profile": {
        "height": 171,
        "weight": 60,
        "age": 28,
        "body_fat": 22,
        "gender": "female",
        "environment": "outdoor",
        "activity_level": "walking"
    },
    "sido": "서울특별시",
    "sigungu": "강남구"
}

req = urllib.request.Request(
    url,
    data=json.dumps(data).encode('utf-8'),
    headers={"Content-Type": "application/json"},
    method="POST"
)

try:
    with urllib.request.urlopen(req, timeout=10) as response:
        result = json.loads(response.read())
        print("=== API Response ===")
        print(f"utci: {result.get('utci')}")
        print(f"utci_personalized: {result.get('utci_personalized')}")
        print(f"utci_category: {result.get('utci_category')}")
        print(f"pmv: {result.get('pmv')}")
        print(f"thermal_sensation: {result.get('thermal_sensation')}")
        print(f"body_params: {result.get('body_params')}")
        print(f"weather: {result.get('weather')}")
except Exception as e:
    print(f"Error: {e}")
