-- =======================================================
-- 데이터베이스 스키마 정의 DDL (Supabase PostgreSQL용)
-- =======================================================

-- 1. 지역 디멘전 테이블 생성 (행정구역 및 기상청 격자/ASOS 매핑)
CREATE TABLE IF NOT EXISTS region_dimension (
    id SERIAL PRIMARY KEY,
    sido VARCHAR(50) NOT NULL,
    sigungu VARCHAR(50) NOT NULL,
    nx INTEGER NOT NULL,          -- 기상청 단기예보 격자 X
    ny INTEGER NOT NULL,          -- 기상청 단기예보 격자 Y
    station_id INTEGER NOT NULL,  -- ASOS 관측소 ID (stnId)
    UNIQUE(sido, sigungu)
);

-- 2. 과거 기상 집계 요약 팩트 테이블 생성
CREATE TABLE IF NOT EXISTS historical_weather_fact (
    region_id INTEGER REFERENCES region_dimension(id) ON DELETE CASCADE,
    month INTEGER CHECK (month BETWEEN 1 AND 12),
    hour INTEGER CHECK (hour BETWEEN 0 AND 23),
    avg_temp REAL,
    avg_humidity REAL,
    avg_pmv REAL,
    PRIMARY KEY (region_id, month, hour)
);

-- 3. 실시간 기상 캐시 테이블 생성
CREATE TABLE IF NOT EXISTS weather_cache (
    region_id INTEGER REFERENCES region_dimension(id) ON DELETE CASCADE PRIMARY KEY,
    temperature REAL,
    humidity REAL,
    wind_speed REAL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. 기본 시드 데이터 적재 (서울시 주요 구)
INSERT INTO region_dimension (sido, sigungu, nx, ny, station_id) 
VALUES 
('서울특별시', '강남구', 61, 125, 108),
('서울특별시', '서초구', 61, 125, 108),
('서울특별시', '송파구', 62, 126, 108),
('서울특별시', '마포구', 59, 127, 108),
('서울특별시', '종로구', 60, 127, 108)
ON CONFLICT (sido, sigungu) DO NOTHING;

-- 5. 테스트용 과거 기상 요약 팩트 데이터 적재 (강남구 7월 19시 평균 기상 시뮬레이션)
-- (region_dimension 테이블 강남구 행의 id를 매핑하여 적재)
INSERT INTO historical_weather_fact (region_id, month, hour, avg_temp, avg_humidity, avg_pmv)
SELECT 
    id, 
    7, 
    19, 
    30.5, 
    72.0, 
    2.1 
FROM region_dimension WHERE sigungu = '강남구'
ON CONFLICT (region_id, month, hour) DO NOTHING;
