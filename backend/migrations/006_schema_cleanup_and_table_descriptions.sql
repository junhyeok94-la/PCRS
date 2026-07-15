-- PCRS schema cleanup: retain only tables used by the current product UI/API.
-- Run this in the Supabase SQL editor after verifying that legacy data is not needed.
-- DROP TABLE is intentionally RESTRICT (the PostgreSQL default): unexpected
-- dependencies stop the migration instead of being silently removed.

drop table if exists public.user_feedback_log;
drop table if exists public.user_profile;
drop table if exists public.historical_weather_fact;

comment on table public.profiles is
  '회원별 개인화 프로필. 설정 화면에서 키·몸무게·체지방률·출생연도·활동/실내외 환경을 저장하고, 의류 추천 계산에 사용한다.';

comment on table public.user_consents is
  '회원가입 및 설정 화면의 이용약관·개인정보 처리방침·마케팅 수신 동의 상태와 적용한 정책 버전을 보관한다.';

comment on table public.wardrobe_items is
  '옷장 탭에서 등록한 사용자 보유 의류. 보온성·방수·계절·세탁 상태를 추천 엔진이 반영한다.';

comment on table public.recommendation_feedback is
  '홈 화면의 추천 체감 피드백(추움·좋음·더움). 이후 개인화 추천의 보온 선호 보정에 사용한다.';

comment on table public.user_locations is
  '장소 선택 시트에서 저장한 개인 장소. 다음 방문 때 해당 좌표의 날씨·개인화 분석을 바로 불러오는 데 사용한다.';

comment on table public.account_deletion_requests is
  '설정 화면의 계정 삭제 요청과 30일 유예 기간을 관리한다. 유예 기간 안에는 사용자가 취소할 수 있다.';

comment on table public.location_dimension is
  '공용 날씨 분석 기준 지역 목록. 장소 선택 시트와 날씨 캐시의 위치 키로 사용하며 개인 정보는 저장하지 않는다.';

comment on table public.weather_forecast_cache is
  '지역별 Open-Meteo 시간대 예보와 UTCI 계산 결과 캐시. 홈·시간별 활동 분석의 빠른 응답과 외부 API 호출 절감에 사용한다.';
