import os
import math
import glob
import pandas as pd
import duckdb
import boto3
from botocore.exceptions import ClientError
from supabase import create_client, Client
from dotenv import load_dotenv

# .env 파일 로드
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_DEFAULT_REGION = os.getenv("AWS_DEFAULT_REGION", "ap-northeast-2")
AWS_S3_BUCKET_NAME = os.getenv("AWS_S3_BUCKET_NAME")

# Supabase 및 S3 클라이언트 초기화
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
s3_client = boto3.client(
    "s3",
    aws_access_key_id=AWS_ACCESS_KEY_ID,
    aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    region_name=AWS_DEFAULT_REGION
)

# 임시 작업 디렉토리 생성
TEMP_DIR = "./temp_lakehouse"
os.makedirs(TEMP_DIR, exist_ok=True)

def calculate_pmv(ta: float, tr: float, vel: float, rh: float, met: float, clo: float) -> float:
    """Fanger PMV Fomula (Fanger's thermal comfort solver)"""
    try:
        pa = rh * 10.0 * 0.61078 * math.exp(17.27 * ta / (ta + 237.3))
        m = met * 58.15
        w = 0.0
        
        if clo <= 0.078:
            fcl = 1.0 + 1.29 * clo
        else:
            fcl = 1.05 + 0.645 * clo
            
        rcl = clo * 0.155
        temp_a = ta + 273.15
        temp_r = tr + 273.15
        tcl = temp_a + 3.0
        
        n = 0
        eps = 0.00015
        hc = 0.0
        
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
        return round(pmv, 2)
    except Exception:
        return 0.0

def process_txt_to_parquet():
    """S3 버킷의 raw 텍스트 파일들을 스캔하여 Parquet로 가공 및 S3 Lakehouse 적재"""
    print("🚀 Scanning raw ASOS files in S3 bucket...")
    try:
        response = s3_client.list_objects_v2(Bucket=AWS_S3_BUCKET_NAME)
        if "Contents" not in response:
            print("  ⚠️ No files found in S3 bucket.")
            return []
        
        raw_files = [obj["Key"] for obj in response["Contents"] if "asos_" in obj["Key"] and obj["Key"].endswith(".txt")]
        if not raw_files:
            print("  ⚠️ No raw ASOS txt files found in S3.")
            return []
        
        parquet_local_paths = []
        
        for key in raw_files:
            # S3에서 로컬 임시 다운로드
            local_txt_path = os.path.join(TEMP_DIR, os.path.basename(key))
            print(f"  📥 Downloading {key} from S3...")
            s3_client.download_file(AWS_S3_BUCKET_NAME, key, local_txt_path)
            
            # 파싱 및 DataFrame 생성
            header_lines = []
            data_rows = []
            
            with open(local_txt_path, "r", encoding="utf-8") as f:
                for line in f:
                    stripped = line.strip()
                    if not stripped:
                        continue
                    if stripped.startswith("#"):
                        header_lines.append(stripped)
                        continue
                    # 데이터 레코드 파싱
                    data_rows.append(stripped.split())
                    
            if not data_rows:
                print(f"  ⚠️ File {key} contains no data records. Skipping.")
                continue
                
            # Pandas DataFrame 생성 (공백 구분 텍스트 기준)
            # ASOS 데이터 형식 대응 매핑:
            # 1: YYMMDDHHMI, 2: STN, 4: WS, 12: TA, 14: HM
            df = pd.DataFrame(data_rows)
            
            # 텍스트 형식에 따라 최소 컬럼 수 검증
            if df.shape[1] < 15:
                print(f"  ⚠️ File {key} has unexpected column size: {df.shape[1]}. Skipping.")
                continue
                
            # 필요한 열만 추출 및 컬럼명 지정
            # YYMMDDHHMI(0), STN(1), WS(3), TA(11), HM(13)
            df_cleaned = df[[0, 1, 3, 11, 13]].copy()
            df_cleaned.columns = ["YYMMDDHHMI", "STN", "WS", "TA", "HM"]
            
            # 형변환 및 결측치 보정 (-9 및 -9.0 제거)
            df_cleaned["TA"] = pd.to_numeric(df_cleaned["TA"], errors="coerce").fillna(25.0)
            df_cleaned["HM"] = pd.to_numeric(df_cleaned["HM"], errors="coerce").fillna(60.0)
            df_cleaned["WS"] = pd.to_numeric(df_cleaned["WS"], errors="coerce").fillna(1.5)
            
            # 결측값 기상청 특수값 보정
            df_cleaned.loc[df_cleaned["TA"] < -90.0, "TA"] = 25.0
            df_cleaned.loc[df_cleaned["HM"] < 0.0, "HM"] = 60.0
            df_cleaned.loc[df_cleaned["WS"] < 0.0, "WS"] = 1.5
            
            # PMV 온열지수 컬럼 추가 계산 (met=1.2, clo=0.5 기본값 기준 과거 통계용)
            pmv_list = []
            for _, row in df_cleaned.iterrows():
                ta_val = float(row["TA"])
                rh_val = float(row["HM"])
                v_val = float(row["WS"])
                tr_val = ta_val + 5.0 # 실외 복사열 가중치
                pmv_val = calculate_pmv(ta=ta_val, tr=tr_val, vel=v_val, rh=rh_val, met=1.2, clo=0.5)
                pmv_list.append(pmv_val)
                
            df_cleaned["pmv"] = pmv_list
            
            # Parquet 내보내기
            # 파티셔닝용 연/월 추출
            date_str = df_cleaned["YYMMDDHHMI"].iloc[0]
            year = date_str[0:4]
            month = date_str[4:6]
            stn_id = df_cleaned["STN"].iloc[0]
            
            local_parquet_name = f"asos_{stn_id}_{year}{month}.parquet"
            local_parquet_path = os.path.join(TEMP_DIR, local_parquet_name)
            
            # Parquet로 저장
            df_cleaned.to_parquet(local_parquet_path, engine="pyarrow")
            parquet_local_paths.append((local_parquet_path, year, month, stn_id))
            
            # S3 레이크하우스 경로 적재
            s3_parquet_key = f"lakehouse/year={year}/month={month}/asos_{stn_id}.parquet"
            print(f"  📤 Uploading Parquet to S3: {s3_parquet_key} ...")
            s3_client.upload_file(local_parquet_path, AWS_S3_BUCKET_NAME, s3_parquet_key)
            
        return parquet_local_paths
    except Exception as e:
        print(f"❌ Error processing S3 files to Parquet: {e}")
        return []

def aggregate_via_duckdb(parquet_files):
    """DuckDB를 이용해 파티셔닝된 Parquet 데이터레이크를 스캔 및 집계하여 DB 통계 팩트 적재"""
    if not parquet_files:
        print("⚠️ No parquet files to aggregate.")
        return
        
    print("\n🦆 Running DuckDB SQL analytical aggregation...")
    con = duckdb.connect(database=":memory:")
    
    # 로컬 임시 Parquet 목록 스캔
    parquet_pattern = os.path.join(TEMP_DIR, "*.parquet")
    
    # DuckDB로 월별, 시간별, 관측소별 평균 기상 정보 및 PMV를 집계
    query = f"""
    SELECT 
        CAST(STN AS INTEGER) as station_id,
        CAST(SUBSTR(YYMMDDHHMI, 5, 2) AS INTEGER) as month,
        CAST(SUBSTR(YYMMDDHHMI, 7, 2) AS INTEGER) as hour,
        ROUND(AVG(TA), 2) as avg_temp,
        ROUND(AVG(HM), 2) as avg_humidity,
        ROUND(AVG(pmv), 2) as avg_pmv
    FROM read_parquet('{parquet_pattern}')
    GROUP BY station_id, month, hour
    ORDER BY station_id, month, hour
    """
    
    try:
        res_df = con.execute(query).fetchdf()
        print(f"  📊 Aggregated {len(res_df)} summary records via DuckDB:")
        print(res_df.head(10))
        
        # Supabase DB 적재 (historical_weather_fact 테이블)
        # 먼저 region_dimension 테이블의 station_id -> region_id 매핑 캐싱
        regions_res = supabase.table("region_dimension").select("id, station_id").execute()
        station_to_region = {r["station_id"]: r["id"] for r in regions_res.data}
        
        inserted_count = 0
        for _, row in res_df.iterrows():
            stn_id = int(row["station_id"])
            if stn_id not in station_to_region:
                continue
            
            region_id = station_to_region[stn_id]
            data = {
                "region_id": region_id,
                "month": int(row["month"]),
                "hour": int(row["hour"]),
                "avg_temp": float(row["avg_temp"]),
                "avg_humidity": float(row["avg_humidity"]),
                "avg_pmv": float(row["avg_pmv"])
            }
            # Upsert 실행
            supabase.table("historical_weather_fact").upsert(data).execute()
            inserted_count += 1
            
        print(f"✅ Successfully upserted {inserted_count} aggregation records to Supabase.")
        
    except Exception as e:
        print(f"❌ Error during DuckDB aggregation and DB load: {e}")
    finally:
        # 정리 작업
        con.close()
        for f in glob.glob(os.path.join(TEMP_DIR, "*")):
            os.remove(f)
        os.rmdir(TEMP_DIR)
        print("🗑️ Cleaned up local temporary lakehouse files.")

if __name__ == "__main__":
    files = process_txt_to_parquet()
    aggregate_via_duckdb(files)
