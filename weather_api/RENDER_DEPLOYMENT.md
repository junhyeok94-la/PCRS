# 기존 Render 서비스의 Android 날씨 API 전환

대상 서비스: `pcrs-api-beta` / `srv-d9c4pcvavr4c73abdnkg`.
확인한 공개 주소: `https://pcrs-api-beta.onrender.com`.
이 문서는 배포 설정과 확인 절차이며, 실제 전환 성공 여부는 아래 실행 기록으로 구분한다.

## 설정

저장소 루트의 `render.yaml`을 기존 Blueprint에 동기화한다. 새 서비스를 만들거나 유료 플랜·디스크를 추가하지 않는다.

- Root Directory: `.` (저장소 루트)
- Build: `pip install -r weather_api/requirements.txt`
- Start: `uvicorn weather_api.main:app --host 0.0.0.0 --port $PORT --workers 1 --no-access-log --no-proxy-headers`
- Health check: `/health`. 이는 키나 외부 API를 조회하지 않는 프로세스 생존 검사다.
- `KMA_SERVICE_KEY`: 공공데이터포털의 기존 일반 인증키를 Render 환경변수에만 저장한다. `.env`를 커밋·업로드하지 않는다.
- `KMA_DAILY_REQUEST_LIMIT=200`: 이 인스턴스가 같은 KST 날짜에 시도하는 기상청 요청 수의 초기 테스트 제한이다. 실패·페이지 요청도 포함한다. 제공자 계정의 실제 허용량을 뜻하지 않는다.

이 서비스 전환은 기존 웹용 API를 교체한다. 기존 Supabase 변수는 새 앱이 읽지 않는다. 배포에 필요하지 않은 기존 비밀값을 출력하거나 자동 이전하지 않는다. 키는 Android APK·저장소·로그에 넣지 않는다. 접근 로그는 끄고 프록시 헤더를 신뢰하지 않는다. 공개 API는 공공 날씨/지역만 반환하며 사용자 체감·개인 설정은 휴대폰 로컬에 남는다.

## 무료 플랜과 검증 경계

[Render 무료 플랜](https://render.com/docs/free)은 15분 비활동 후 절전되며 첫 요청에 약 1분이 걸릴 수 있다. Android HTTPS 요청은 최대 90초의 읽기 대기 시간을 사용한다. 실패한 요청을 무한 재시도하거나 유지용 주기 호출로 서버를 깨워두지 않는다. 최초 연결·갱신 실패 후 재시도 UX는 실기기에서 확인한다.

무료 플랜의 파일시스템은 재시작/재배포/절전 시 초기화된다. 따라서 SQLite 날씨 캐시와 일일 호출 시도 카운터도 잃는다. 실행 중에는 격자별 캐시·중복 요청 합치기·발표 시각 기준 재사용·요청 제한이 작동하지만 **재시작을 넘는 계정 전체 호출 한도 보장은 아니다**. 로컬 PC 서버와 Render는 카운터를 공유하지 않는다. 제공자 자체 한도와 사용량을 함께 확인한다. 영속 공유 캐시/카운터가 필요한 공개 운영은 별도 저장소 설계 후 진행한다. 이번 범위는 본인 한 명의 제한적 앱 테스트다.

기존 모바일 디스크 캐시는 별도로 유지한다. 예전 자료를 최신으로 표시하지 않으며 기간 제한을 넘기면 사용하지 않는다. 서버에 로그인·체감 기록 동기화·옷장 저장 기능을 추가하지 않았다.

## 전환 확인 순서

1. 코드·테스트를 완료하고 Render가 읽는 GitHub 브랜치에 필요한 서버/설정 변경만 반영한다.
2. 기존 Blueprint/서비스의 루트·빌드·시작 명령과 기상청 환경변수를 확인한다. `/ready`는 키 설정 유무와 저장소 준비만 검사하며 실제 인증 성공을 보장하지 않는다.
3. 새 배포가 live가 된 뒤 공개 HTTPS `/health`, `/ready`, `/v1/regions`를 확인한다.
4. 한 지역의 실제 `/v1/weather`를 조회해 `isSample=false`, 자료 시각·기상청 오류 코드·자료 유무를 확인한다. 같은 요청을 다시 해 `fetchedAt` 재사용을 확인한다. 키/전체 예보를 검증 로그에 출력하지 않는다.
5. `-PweatherDebugApiBaseUrl=https://pcrs-api-beta.onrender.com`으로 debug APK를 빌드한다. 기존 debug 서명으로 `adb install -r`하여 사용자 자료를 보존한다. release 기본 주소는 별도 배포 승인 전 빈 값을 유지한다.
6. USB/무선 디버깅의 `adb reverse tcp:8010`을 제거한 상태에서 휴대폰의 지역 조회·날씨 갱신을 확인한다. 이때 PC 로컬 날씨 서버를 종료해도 동작해야 한다.
7. 설치 완료 후 무선 디버깅을 끄거나 PC와의 연결을 종료해도 HTTPS 날씨를 받을 수 있다. 밖에서는 Wi-Fi 또는 모바일 데이터가 필요하다.

## 실행 기록

2026-11-03: 설정 변경을 GitHub main의 `28f5173`에 반영했다. 기존 Blueprint가 자동 동기화되어 새 Root/Build/Start 명령이 적용되었고 배포 `dep-dbkmset9fdbs73bptmr0`가 live가 된 것을 Render 연결 도구로 확인했다. 무료 플랜을 유지했다. 공개 HTTPS `/health`는 새 `thermal-guide-weather` 서비스와 schemaVersion 1.0을 반환했다.

초기 `/ready`는 HTTP 503 · `ready=false`였다. 사용자에게 Render 환경에 `KMA_SERVICE_KEY`를 직접 저장하도록 안내했고, 키 값은 읽거나 전송·출력하지 않았다. 이후 사용자 측 수동 배포 `dep-dbkn156k1f9s73deups0`가 live로 전환된 뒤 `/ready` HTTP 200 · `ready=true`를 확인했다. 연결 도구 작업공간은 사용자가 확인한 `준혁's workspace` (`tea-d9c4gmm1a83c73bnnul0`)로 명시한다.

공개 HTTPS에서 실제 날씨 POST를 두 번 호출해 HTTP 200, `isSample=false`, 자료 상태 available, 예보 35시점·실황 1시점, 오류 없음과 두 번째 조회의 예보 `fetchedAt` 재사용을 확인했다. 검증 당시 수신 시각은 2026-11-03 14:28 KST다. 이는 그 시점의 연결·캐시 검사이며 항상 최신 자료가 보장된다는 뜻은 아니다.

HTTPS 주소를 사용하는 Android debug 빌드·테스트 130개·lint 오류 0개(기존 경고 11개)를 확인했다. 설치 파일은 로컬 무시 경로 `android/.gradle/phone-install/thermal-guide-render-debug.apk`에 복사했다. 휴대폰 재연결 후 기존 debug 서명으로 `adb install -r` 업데이트 설치에 성공했다. 앱 자료를 지우거나 가상 체감 기록을 주입하지 않았다.

PC의 로컬 weather_api 서버를 종료하고 포트 8010에 리스너가 없는 것을 확인했다. 폰의 reverse 터널 목록도 비어 있다. 이 상태에서 실제 MainActivity를 열어 14:00 대표 관측과 예보가 표시되는 것을 확인하고 날씨 새로고침을 요청했다. 따라서 앱 연결은 PC 로컬 터널에 의존하지 않는다. 빌드 백그라운드는 종료했다. 모바일 데이터 환경과 무료 서버의 절전 후 장시간 재기동은 아직 실제 폰에서 검증하지 않았으므로 일상 테스트 때 확인한다.
