import os
import math
import requests
import datetime
import boto3
from botocore.exceptions import ClientError
from supabase import create_client, Client
from dotenv import load_dotenv

# .env 파일 로드
load_dotenv()

# 환경 변수 로드
KMA_APIHUB_API_KEY = os.getenv("KMA_APIHUB_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_DEFAULT_REGION = os.getenv("AWS_DEFAULT_REGION", "ap-northeast-2")
AWS_S3_BUCKET_NAME = os.getenv("AWS_S3_BUCKET_NAME")

# Supabase 클라이언트 초기화
supabase: Client = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("✅ Supabase client initialized successfully.")
    except Exception as e:
        print(f"⚠️ Failed to initialize Supabase client: {e}")

def calculate_pmv(ta: float, tr: float, vel: float, rh: float, met: float, clo: float) -> float:
    """
    Fanger의 PMV 온열지수 계산 공식 (안정적 켈빈 반복법 수렴 구현)
    """
    pa = rh * 10.0 * 0.61078 * math.exp(17.27 * ta / (ta + 237.3))
    
    m = met * 58.15  # W/m2
    w = 0.0          # 외부 작업량 0
    
    if clo <= 0.078:
        fcl = 1.0 + 1.29 * clo
    else:
        fcl = 1.05 + 0.645 * clo
        
    rcl = clo * 0.155
    
    temp_a = ta + 273.15
    temp_r = tr + 273.15
    
    # Tcl (켈빈 온도)의 초기값 설정
    tcl = temp_a + 3.0
    
    n = 0
    eps = 0.00015
    hc = 0.0
    
    # 단순 반복법을 통한 Tcl 수렴 계산
    while n < 150:
        hc1 = 2.38 * abs(tcl - temp_a) ** 0.25
        hc2 = 12.1 * math.sqrt(vel) if vel > 0 else 0.0
        hc = hc1 if hc1 > hc2 else hc2
        
        rad_const = 3.96e-8
        
        numerator = 308.85 - 0.028 * (m - w) + rcl * fcl * rad_const * (temp_r ** 4) + rcl * fcl * hc * temp_a - rcl * fcl * rad_const * (tcl ** 4)
        denominator = 1.0 + rcl * fcl * hc
        
        tcl_new = numerator / denominator
        
        if abs(tcl_new - tcl) < eps:
            tcl = tcl_new
            break
        tcl = (tcl + tcl_new) / 2.0
        n += 1
        
    hl1 = 3.05 * 0.001 * (5733.0 - 6.99 * (m - w) - pa)
    hl2 = 0.42 * (m - w - 58.15) if (m - w) > 58.15 else 0.0
    hl3 = 1.7 * 0.00001 * m * (5867.0 - pa)
    hl4 = 0.0014 * m * (34.0 - ta)
    hl5 = fcl * hc * (tcl - temp_a)
    hl6 = 3.96e-8 * fcl * ((tcl ** 4) - (temp_r ** 4))
    
    ts = 0.303 * math.exp(-0.036 * m) + 0.028
    l = m - w - hl1 - hl2 - hl3 - hl4 - hl5 - hl6
    pmv = ts * l
    return pmv

def generate_mock_asos_data(stn_id: int, date_str: str) -> str:
    """기상청 API 허브 호출 실패 또는 미신청 시 활용할 하루 단위 공백 구분 텍스트 포맷 Mock 데이터를 생성합니다."""
    print(f"🔮 Generating mock ASOS space-separated text for station {stn_id} (Date: {date_str})...")
    
    curr_date = datetime.datetime.strptime(date_str, "%Y%m%d")
    month = curr_date.month
    
    lines = [
        "# KOREA METEOROLOGICAL ADMINISTRATION SURFACE OBSERVATION SYSTEM",
        "# YYMMDDHHMI STN WD WS GST GST GST PA PS PT PR TA TD HM PV TA"
    ]
    
    base_temp = 22.0
    if month in [12, 1, 2]:
        base_temp = -2.0
    elif month in [3, 4, 5]:
        base_temp = 12.0
    elif month in [6, 7, 8]:
        base_temp = 28.0
    elif month in [9, 10, 11]:
        base_temp = 15.0
        
    for hour in range(24):
        hour_diff = -math.cos((hour - 4) * math.pi / 12) * 5.0
        ta = round(base_temp + hour_diff, 1)
        hm = round(70.0 - hour_diff * 4.0, 1)
        hm = max(30.0, min(95.0, hm))
        ws = round(1.0 + abs(hour_diff) * 0.3, 1)
        
        tm_str = f"{date_str}{hour:02d}00"
        line = f"{tm_str} {stn_id} 27 {ws} -9 -9 -9 -9 -9 -9 -9 {ta} -9 {hm} -9 {ta}"
        lines.append(line)
        
    return "\n".join(lines)

def fetch_asos_hourly_data(stn_id: int, date_str: str) -> str:
    """하루 단위(date_str)로 기상청 API 허브 kma_sfctm2.php를 00시~23시까지 24회 호출하여 병합한 텍스트 자료를 획득합니다."""
    if not KMA_APIHUB_API_KEY or KMA_APIHUB_API_KEY == "your_apihub_key":
        return generate_mock_asos_data(stn_id, date_str)
        
    url = "https://apihub.kma.go.kr/api/typ01/url/kma_sfctm2.php"
    header_lines = []
    data_lines = []
    has_real_data = False
    header_collected = False
    
    print(f"📡 Calling KMA API Hub ASOS (kma_sfctm2.php) for Station {stn_id} ({date_str}) [24-hour Loop]...")
    
    for hour in range(24):
        tm_val = f"{date_str}{hour:02d}00"
        params = {
            "tm": tm_val,
            "stn": str(stn_id),
            "disp": "1",
            "help": "1",
            "authKey": KMA_APIHUB_API_KEY
        }
        
        try:
            response = requests.get(url, params=params, timeout=10)
            if response.status_code != 200:
                print(f"  ⚠️ Hour {hour:02d}: HTTP {response.status_code} Error. Skipping.")
                continue
                
            res_text = response.text
            if "활용신청이 필요한 API" in res_text or "유효하지 않은 API" in res_text:
                print(f"  ❌ Hour {hour:02d}: Unauthorized API response. Aborting loop to fallback.")
                return generate_mock_asos_data(stn_id, date_str)
                
            # 라인 단위 파싱
            lines = res_text.splitlines()
            local_data_found = False
            
            for line in lines:
                stripped = line.strip()
                if not stripped:
                    continue
                if stripped.startswith("#"):
                    # 첫 번째 성공한 응답에서만 헤더 주석 구조를 수집해둡니다. (마지막 END 주석은 제외)
                    if not header_collected and "7777END" not in stripped:
                        header_lines.append(line)
                    continue
                
                # 데이터 라인 수집 (START7777, END 제외)
                if "START7777" in stripped or "7777END" in stripped:
                    continue
                
                # 정상 데이터 라인은 보통 시간(tm_val)으로 시작함
                if stripped.startswith(date_str):
                    data_lines.append(line)
                    local_data_found = True
                    has_real_data = True
            
            if local_data_found:
                header_collected = True
            
            if not local_data_found:
                print(f"  ⚠️ Hour {hour:02d}: No data record found in response.")
                
        except Exception as e:
            print(f"  ⚠️ Hour {hour:02d} Exception: {e}. Skipping.")
            continue
            
    if not has_real_data:
        print(f"❌ Failed to fetch any valid real weather records for date {date_str}. Generating mock fallback.")
        return generate_mock_asos_data(stn_id, date_str)
        
    # 헤더와 수집된 데이터 라인들을 결합
    final_lines = []
    if header_lines:
        final_lines.extend(header_lines)
    else:
        # 헤더가 없을 경우를 대비한 기본 헤더 주석
        final_lines.extend([
            "#START7777",
            "# YYMMDDHHMI STN WD WS GST GST GST PA PS PT PR TA TD HM PV TA",
            "# KST ID 16 m/s WD WS TM hPa hPa - hPa C C % hPa"
        ])
        
    final_lines.extend(data_lines)
    final_lines.append("#7777END")
    
    print(f"  ✅ Successfully merged {len(data_lines)} hourly records for date {date_str}.")
    return "\n".join(final_lines)

def upload_to_s3(data_text: str, stn_id: int, date_str: str) -> str:
    """Raw 기상 텍스트 데이터를 S3 버킷에 하루 단위 파일로 정규화 적재합니다 (멱등성 확보)."""
    year = date_str[:4]
    month = date_str[4:6]
    s3_key = f"raw/weather/asos/year={year}/month={month}/asos_{stn_id}_{date_str}.txt"
    
    # 1. AWS S3 업로드 시도
    if AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY and AWS_S3_BUCKET_NAME:
        try:
            print(f"📤 Uploading raw text to S3: s3://{AWS_S3_BUCKET_NAME}/{s3_key}")
            s3_client = boto3.client(
                's3',
                aws_access_key_id=AWS_ACCESS_KEY_ID,
                aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
                region_name=AWS_DEFAULT_REGION
            )
            s3_client.put_object(
                Bucket=AWS_S3_BUCKET_NAME,
                Key=s3_key,
                Body=data_text.encode('utf-8'),
                ContentType='text/plain'
            )
            print("🚀 S3 Upload complete!")
            return f"s3://{AWS_S3_BUCKET_NAME}/{s3_key}"
        except ClientError as e:
            print(f"⚠️ AWS ClientError: {e}. Falling back to local mock storage.")
        except Exception as e:
            print(f"⚠️ S3 Upload failed due to unexpected error: {e}. Falling back to local mock storage.")
    else:
        print("⚠️ AWS credentials or bucket name missing in .env. Falling back to local mock storage.")
        
    # 2. 로컬 모의 스토리지 (Fallback)
    local_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "s3_local_mock", f"year={year}", f"month={month}")
    os.makedirs(local_dir, exist_ok=True)
    local_path = os.path.join(local_dir, f"asos_{stn_id}_{date_str}.txt")
    
    with open(local_path, "w", encoding="utf-8") as f:
        f.write(data_text)
    print(f"📁 Raw weather text saved to local mock storage: {local_path}")
    return local_path

def transform_and_aggregate(raw_text: str, region_id: int) -> list:
    """Raw 공백 구분 텍스트 데이터를 헤더 맵을 생성하여 유연하게 파싱하고 PMV 통계 데이터를 집계합니다."""
    if not raw_text:
        return []
        
    lines = raw_text.splitlines()
    header_idx = {}
    data_rows = []
    
    # 결측치 판정 함수
    def is_missing(v: str) -> bool:
        return v in ["-9", "-9.0", "-99", "-99.0", "-999", "-999.0", "", None]
        
    # 1. 주석 라인 스킵 및 헤더 컬럼 이름 분석
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
        print("⚠️ Failed to detect headers from CSV comments. Using default KMA kma_sfctm2 indexing.")
        header_idx = {"YYMMDDHHMI": 0, "STN": 1, "WD": 2, "WS": 3, "TA": 12, "HM": 14}
        
    time_col = "YYMMDDHHMI" if "YYMMDDHHMI" in header_idx else "TM"
    required_cols = [time_col, "TA", "HM", "WS"]
    for col in required_cols:
        if col not in header_idx:
            print(f"❌ Error: Required column '{col}' is missing in the data header. Ingestion aborted.")
            return []
            
    # 2. 데이터 집계
    grouped_data = {}
    for row in data_rows:
        try:
            tm_val = row[header_idx[time_col]]
            if len(tm_val) >= 10:
                dt = datetime.datetime.strptime(tm_val[:10], "%Y%m%d%H")
            else:
                continue
                
            month = dt.month
            hour = dt.hour
            
            ta_str = row[header_idx["TA"]]
            hm_str = row[header_idx["HM"]]
            ws_str = row[header_idx["WS"]]
            
            if is_missing(ta_str) or is_missing(hm_str) or is_missing(ws_str):
                continue
                
            ta = float(ta_str)
            rh = float(hm_str)
            vel = float(ws_str)
            
            if ta < -90 or rh < 0 or vel < 0:
                continue
                
            pmv = calculate_pmv(ta=ta, tr=ta+2.0, vel=vel, rh=rh, met=1.2, clo=0.5)
            
            key = (month, hour)
            if key not in grouped_data:
                grouped_data[key] = {"temps": [], "hums": [], "pmvs": []}
                
            grouped_data[key]["temps"].append(ta)
            grouped_data[key]["hums"].append(rh)
            grouped_data[key]["pmvs"].append(pmv)
            
        except Exception:
            continue
            
    # 최종 평균 집계
    aggregated_results = []
    for (month, hour), values in grouped_data.items():
        if not values["temps"]:
            continue
        avg_temp = round(sum(values["temps"]) / len(values["temps"]), 2)
        avg_humidity = round(sum(values["hums"]) / len(values["hums"]), 2)
        avg_pmv = round(sum(values["pmvs"]) / len(values["pmvs"]), 2)
        
        aggregated_results.append({
            "region_id": region_id,
            "month": month,
            "hour": hour,
            "avg_temp": avg_temp,
            "avg_humidity": avg_humidity,
            "avg_pmv": avg_pmv
        })
        
    print(f"📊 Transformed {len(data_rows)} raw records into {len(aggregated_results)} monthly-hourly weather facts.")
    return aggregated_results

def upsert_historical_weather(aggregated_data: list):
    """Supabase DB historical_weather_fact 테이블에 가공 데이터를 Upsert 합니다."""
    if not supabase:
        print("⚠️ Supabase client is not connected. Skipping DB load.")
        return
        
    if not aggregated_data:
        print("⚠️ No data to load.")
        return
        
    try:
        print(f"💾 Upserting {len(aggregated_data)} records to historical_weather_fact in Supabase...")
        chunk_size = 100
        for i in range(0, len(aggregated_data), chunk_size):
            chunk = aggregated_data[i:i + chunk_size]
            response = supabase.table("historical_weather_fact").upsert(chunk).execute()
        print("🚀 Supabase load completed successfully!")
    except Exception as e:
        print(f"❌ Failed to upsert data to Supabase: {e}")

def collect_past_weather(stn_id: int = 108, region_id: int = 1, start_date: str = None, end_date: str = None):
    """단독 실행 및 Airflow Task 호출용 메인 컨트롤러 함수입니다."""
    if not start_date or not end_date:
        today = datetime.date.today()
        start_date = (today - datetime.timedelta(days=60)).strftime("%Y%m%d")
        end_date = (today - datetime.timedelta(days=30)).strftime("%Y%m%d")
        
    print(f"=== Starting ASOS Weather Data Ingestion for Region ID {region_id} (Stn {stn_id}) ===")
    print(f"Period: {start_date} ~ {end_date}")
    
    start_dt = datetime.datetime.strptime(start_date, "%Y%m%d")
    end_dt = datetime.datetime.strptime(end_date, "%Y%m%d")
    delta = end_dt - start_dt
    
    all_aggregated = []
    
    # 중복 및 대용량 일관성 방어를 위한 [하루 단위(Daily) 멱등성 루프 처리]
    for i in range(delta.days + 1):
        current_date_str = (start_dt + datetime.timedelta(days=i)).strftime("%Y%m%d")
        print(f"\n--- [Processing Day {i+1}/{delta.days+1}]: {current_date_str} ---")
        
        # 1. 기상청 API 허브 데이터 획득
        raw_text = fetch_asos_hourly_data(stn_id, current_date_str)
        
        # 2. 데이터 오염 방지 (메타 데이터 유효성 검증)
        # 주석(#)이 아닌 실제 데이터 행이 최소 1줄 이상 있는지 확인
        actual_lines = [l for l in raw_text.splitlines() if l.strip() and not l.strip().startswith("#")]
        if not actual_lines:
            print(f"⚠️ Warning: No valid weather records found for date {current_date_str}. Ingestion skipped.")
            continue
            
        # 3. S3 (또는 로컬 Fallback) 멱등성 적재 (일자별 파일 Overwrite)
        storage_path = upload_to_s3(raw_text, stn_id, current_date_str)
        
        # 4. 데이터 가공 및 PMV 계산
        day_aggregated = transform_and_aggregate(raw_text, region_id)
        if day_aggregated:
            all_aggregated.extend(day_aggregated)
            
            # 5. Supabase DB 적재 (Upsert)
            upsert_historical_weather(day_aggregated)
            
    print(f"\n=== Ingestion Finished. Ingested data for {len(all_aggregated)} facts across the period. ===")
    return all_aggregated

if __name__ == "__main__":
    # 로컬 단독 테스트 실행
    # (서울 108 관측소, region_id 1번 - 강남구 기준)
    collect_past_weather(
        stn_id=108, 
        region_id=1, 
        start_date="20260601", 
        end_date="20260602"
    )
