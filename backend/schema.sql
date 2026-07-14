-- =======================================================
-- 데이터베이스 스키마 정의 DDL (Supabase PostgreSQL용) - v3.2 (Open-Meteo)
-- =======================================================

-- 1. 지역 디멘전 테이블 생성 (행정구역 및 위경도 매핑)
CREATE TABLE IF NOT EXISTS location_dimension (
    id SERIAL PRIMARY KEY,
    sido VARCHAR(50) NOT NULL,
    sigungu VARCHAR(50) NOT NULL,
    latitude NUMERIC(9, 6) NOT NULL,
    longitude NUMERIC(9, 6) NOT NULL,
    UNIQUE(sido, sigungu)
);

-- 2. 기상 및 UTCI 예보 캐시 테이블 생성 (JSONB 구조로 24시간 배열 일괄 보관)
CREATE TABLE IF NOT EXISTS weather_forecast_cache (
    location_id INTEGER REFERENCES location_dimension(id) ON DELETE CASCADE PRIMARY KEY,
    forecast_date DATE NOT NULL,
    hourly_data JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 사용자 피드백 로그 테이블 생성 (개인 의류 단열 편향(CLO bias) 보정용)
CREATE TABLE IF NOT EXISTS user_feedback_log (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    feedback_type VARCHAR(20) NOT NULL CHECK (feedback_type IN ('too_hot', 'too_cold', 'good')),
    utci_calculated REAL,
    temperature REAL,
    clo_applied REAL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_weather_forecast_cache_updated ON weather_forecast_cache(updated_at);
CREATE INDEX IF NOT EXISTS idx_user_feedback_log_user ON user_feedback_log(user_id, created_at DESC);

-- 4. 기본 거점 시드 데이터 적재 (전국 주요 거점 예시 - 확장 가능)
INSERT INTO location_dimension (sido, sigungu, latitude, longitude) 
VALUES 
('서울특별시', '강남구', 37.5172, 127.0473),
('서울특별시', '서초구', 37.4836, 127.0327),
('서울특별시', '송파구', 37.5145, 127.1059),
('서울특별시', '마포구', 37.5638, 126.9084),
('서울특별시', '종로구', 37.5735, 126.9790),
('서울특별시', '영등포구', 37.5264, 126.8962),
('경기도', '수원시', 37.2636, 127.0286),
('경기도', '성남시', 37.4449, 127.1389),
('부산광역시', '해운대구', 35.1631, 129.1636),
('인천광역시', '중구', 37.4728, 126.6238),
('대구광역시', '중구', 35.8694, 128.6062),
('광주광역시', '동구', 35.1461, 126.9231),
('대전광역시', '중구', 36.3250, 127.4208),
('울산광역시', '남구', 35.5437, 129.3300),
('세종특별자치시', '세종시', 36.4800, 127.2890),
('제주특별자치도', '제주시', 33.5006, 126.5312)
ON CONFLICT (sido, sigungu) DO NOTHING;

-- 5. 사용자 개인 스펙 프로필 테이블 생성 (OAuth 가입 정보와 연동)
CREATE TABLE IF NOT EXISTS user_profile (
    user_id VARCHAR(100) PRIMARY KEY, -- Supabase auth.users.id 매핑용
    height REAL NOT NULL DEFAULT 171.0,
    weight REAL NOT NULL DEFAULT 60.0,
    age INTEGER NOT NULL DEFAULT 30,
    body_fat REAL DEFAULT 22.0,
    gender VARCHAR(10) NOT NULL DEFAULT 'female' CHECK (gender IN ('male', 'female')),
    environment VARCHAR(20) NOT NULL DEFAULT 'outdoor' CHECK (environment IN ('indoor', 'outdoor')),
    activity_level VARCHAR(20) NOT NULL DEFAULT 'walking' CHECK (activity_level IN ('sedentary', 'walking', 'cycling', 'running')),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. 역사/통계 날씨 팩트 테이블 (전처리된 월/일/시간대별 기후 요약 데이터 적재)
CREATE TABLE IF NOT EXISTS historical_weather_fact (
    id SERIAL PRIMARY KEY,
    location_id INTEGER REFERENCES location_dimension(id) ON DELETE CASCADE,
    weather_date DATE NOT NULL,
    weather_hour INTEGER NOT NULL CHECK (weather_hour BETWEEN 0 AND 23),
    temperature REAL NOT NULL,
    humidity REAL NOT NULL,
    wind_speed REAL NOT NULL,
    solar_radiation REAL NOT NULL,
    utci REAL NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(location_id, weather_date, weather_hour)
);

CREATE INDEX IF NOT EXISTS idx_historical_weather_date ON historical_weather_fact(weather_date);


