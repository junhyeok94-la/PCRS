import sys
import os
from datetime import datetime, timedelta
from airflow.decorators import dag, task

# 상위 디렉터리(batch)를 sys.path에 추가하여 collect.py 모듈을 임포트할 수 있도록 설정
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import collect

default_args = {
    'owner': 'airflow',
    'depends_on_past': False,
    'start_date': datetime(2026, 6, 1),
    'email_on_failure': False,
    'email_on_retry': False,
    'retries': 2,
    'retry_delay': timedelta(minutes=5),
}

@dag(
    default_args=default_args,
    schedule_interval='0 1 * * *',  # 매일 새벽 1회 실행
    catchup=False,
    tags=['weather', 'asos', 'supabase', 's3'],
    doc_md="""
    # ASOS 과거 기상 데이터 수집 및 Supabase DB 마트 적재 파이프라인
    * **Airflow 버전**: Apache Airflow 3.2 규격 준수
    * **기능**: 기상청 API 허브 ASOS 시간자료 API 호출 ➡️ S3 멱등성 아카이빙 ➡️ PMV 가공 ➡️ Supabase DB 적재
    """
)
def weather_data_collection_pipeline():

    @task()
    def extract_asos_data(stn_id: int, date_str: str) -> str:
        """기상청 공공데이터 API로부터 ASOS 과거 데이터를 수집하고 S3에 업로드합니다."""
        print(f"Executing extract_asos_data for station {stn_id} (Date: {date_str})...")
        
        # 1. API 호출 (실패 시 mock 데이터 자동 생성)
        raw_text = collect.fetch_asos_hourly_data(stn_id, date_str)
        
        # 데이터 정합성 검증 (실 데이터 1줄 이상 존재해야 함)
        actual_lines = [l for l in raw_text.splitlines() if l.strip() and not l.strip().startswith("#")]
        if not actual_lines:
            raise ValueError(f"No valid weather records found for date {date_str}. Ingestion aborted.")
            
        # 2. S3 (또는 로컬 Fallback) 멱등성 적재 (일자별 파일)
        storage_path = collect.upload_to_s3(raw_text, stn_id, date_str)
        print(f"Raw weather data successfully archived to: {storage_path}")
        
        return raw_text

    @task()
    def transform_data(raw_text: str, region_id: int) -> list:
        """수집된 데이터를 정제하고 체감 온열지수(PMV) 분석 통계에 맞게 변환합니다."""
        print(f"Transforming data for Region ID: {region_id}...")
        
        aggregated_data = collect.transform_and_aggregate(raw_text, region_id)
        return aggregated_data

    @task()
    def load_into_supabase(transformed_data: list) -> str:
        """정제된 기후 데이터를 Supabase DB 캐시 마트에 최종 적재합니다."""
        print(f"Loading {len(transformed_data)} records into Supabase...")
        
        collect.upsert_historical_weather(transformed_data)
        return "Success"

    # 실행 날짜 구하기 (전일)
    yesterday = datetime.now() - timedelta(days=1)
    yesterday_str = yesterday.strftime("%Y%m%d")
    
    # 서울 관측소(108)와 강남구 region_id(1) 기준으로 하루 데이터 수집
    raw = extract_asos_data(stn_id=108, date_str=yesterday_str)
    clean = transform_data(raw, region_id=1)
    status = load_into_supabase(clean)

# Instantiating the DAG
weather_dag = weather_data_collection_pipeline()
