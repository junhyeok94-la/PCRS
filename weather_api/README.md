# Thermal Guide 날씨 API

기존 `backend/`·Supabase·계정·옷장과 독립적인 Android용 날씨 경계다. 기상청 공공데이터포털의 단기예보와 초단기실황을 조회하고, 지역·시각·단위·누락·최신 여부를 구분하여 반환한다. **현재는 로컬 개발 서버**이며 운영 배포는 하지 않았다.

## 실행

저장소 루트 `D:\01.DEV\PCRS`에서 Python 3.11 이상을 사용한다.

```powershell
python -m venv weather_api/.venv
./weather_api/.venv/Scripts/python.exe -m pip install -r weather_api/requirements.txt
# .env가 없을 때만 예제 파일을 복사한다. 이미 설정한 키를 덮어쓰지 않는다.
if (!(Test-Path weather_api/.env)) { Copy-Item weather_api/.env.example weather_api/.env }
```

`weather_api/.env`의 `KMA_SERVICE_KEY=` 뒤에 공공데이터포털 일반 인증키(Decoding 권장)를 입력한다. Encoding 키도 한 번 해제해 요청한다. **API허브의 authKey와는 다르다.** 앱·Git·채팅에 키를 넣지 않는다. 프로세스 환경변수가 있으면 파일보다 우선한다. 설정을 변경하면 서버를 다시 시작한다.

```powershell
./weather_api/.venv/Scripts/python.exe -m uvicorn weather_api.main:app --host 127.0.0.1 --port 8010 --no-access-log --no-proxy-headers
```

현재 PC의 검증에서는 기존 `backend/.venv/Scripts/python.exe` 인터프리터에 설치된 FastAPI/httpx를 사용했다. 옛 서버 코드를 import하거나 실행한 것은 아니다. 별도 환경을 만들 때는 위 절차를 사용한다.

- API 문서: <http://127.0.0.1:8010/docs>
- 상태: <http://127.0.0.1:8010/health>
- 설정 준비 여부: `/ready` — 키가 있는지만 확인하며 실제 인증 성공을 보증하지 않는다.
- 스키마: [openapi.json](openapi.json), 런타임 `/openapi.json`
- Android 에뮬레이터에서 호스트 PC 접근 주소는 `http://10.0.2.2:8010`이다. 앱의 네트워크 권한·디버그 HTTP 정책과 실제 클라이언트 연결은 다음 홈 개발 단계에서 추가한다. 키를 앱에 넣지 않는다.

## API

| 요청 | 역할 |
|---|---|
| `GET /v1/regions?q=서울%20마포구&limit=15` | 공식 전국 3,839개 지역 검색. 시/군/구/동 경로와 격자·대표 좌표 |
| `GET /v1/regions/nearby?latitude=37.5665&longitude=126.9780` | 가장 가까운 공식 동 대표지점 제안. 행정경계 판정이 아니며 사용자 확인 필요 |
| `POST /v1/weather` | 지역 최대 2곳의 실황·시간별 예보. 같은 지역 중복은 합침 |

날씨 요청 예:

```json
{"regionIds":["1144000000","1168000000"],"hours":36}
```

응답의 `schemaVersion`은 `1.0`, `timezone`은 `Asia/Seoul`, 실제 조회의 `isSample`은 `false`다. 각 지역의 `forecast`와 `current`는 별도 발표/수신/만료 시각·출처·최신 상태를 가진다. `current.kind`는 `representative_observation`이며 사용자 위치에서 직접 측정했다는 뜻이 아니다.

- `temperatureC`, `humidityPercent`, `windSpeedMs`, `windDirectionDegrees`, `precipitationProbabilityPercent`의 단위를 필드명에 명시한다.
- `points[].validAt`은 해당 자료 시각이다. `issuedAt`·`fetchedAt`과 다르다.
- `forecast.daily`의 `minimumC`/`maximumC`는 공급자가 준 TMN/TMX만 사용한다. 누락된 하루 최저를 남은 예보의 최솟값으로 채우지 않는다.
- 강수량은 `none`, `exact`, `less_than`, `range`, `at_least`, `unknown`을 구분한다. 예보 PCP의 `30`을 정확한 30mm라고 표시하지 않는다. 실황 RN1 수치는 정량 관측값으로 보존한다.
- 실황에는 SKY가 없으므로 `sky=null`이다. 비가 없다는 이유로 맑음으로 만들지 않는다. 앱에서 예보의 하늘을 보조 표시하면 그 시각·종류를 구분해야 한다.
- 누락과 0을 구분한다. 시각 목록에 빈 구간이 있을 수 있다. 항상 36개의 연속 값이나 모든 변수 제공을 가정하지 않는다.
- 1~48시간의 근거리 시간별 예보만 제공한다. 4~5일 확장 구간의 3시간/정성 정보를 시간별 정량으로 오해하지 않도록 제외한다.

자료가 둘 다 있으면 `available`, 한 구성요소가 없거나 이전 자료/오류가 있으면 `partial`, 둘 다 없으면 `unavailable`이다. 변수 일부가 null인지는 각 필드를 확인한다. 지역별 부분 실패는 유효 자료와 함께 HTTP 200으로 반환하고, 모든 지역이 무자료면 같은 envelope 구조로 HTTP 503을 반환한다. 잘못된 지역·입력은 422, 로컬 요청 한도는 429다. 원문 오류/키/기상청 요청 URL 대신 정해진 오류 코드만 전달한다.

## 캐시·실패 정책

최신 상세 정책과 검증은 [앱·서버 영속 캐시](../android/docs/CACHE_IMPLEMENTATION_STATUS.md)를 따른다.

공급자+자료 종류+격자별 메모리 캐시와 SQLite 캐시를 공유한다. 같은 격자의 동시 요청을 합치고 상류 동시 요청은 4개로 제한한다. 성공 자료의 수신 시각을 캐시 조회 때 새로 쓰지 않는다.

초기 개발 정책은 `Settings`에 명시했다. 이는 기상 정확도·가용성 보장이나 공급자 캐시 조건이라는 뜻이 아니다.

| 항목 | 현재 값 |
|---|---|
| 정상 예보 캐시 | 다음 발표 제공 예정 시각까지 재사용(3시간 발표 주기+10분 제공 지연) |
| 정상 실황 캐시 | 다음 발표 제공 예정 시각까지 재사용(1시간 발표 주기+10분 제공 지연) |
| 갱신 실패 시 예보 사용 상한 | 수신 후 6시간, 미래 대상 구간이 남은 경우만, `stale` 표시 |
| 갱신 실패 시 실황 사용 상한 | 만료 후 20분, 관측 후 90분, 수신 후 90분 중 먼저 오는 제한. `stale` 표시 |
| 상류 실패 재요청 대기 | 30초부터 최대 15분, 연속 실패 시 증가 |
| 자료 캐시/실패 키 수 | 각각 최대 512 |
| 로컬 API 요청 한도 | IP별 `/v1/` 요청 분당 60회, 상태 확인은 제외 |

발표 직후 무자료라면 한 번만 이전 발표를 확인하고 `provider_latest_run_not_ready`·`stale`로 구분한다. 인증/한도 오류는 과거 발표를 반복 조회하지 않는다. 사용 가능한 캐시가 없으면 날씨를 만들어내지 않는다. SQLite를 `.cache/weather.sqlite3`에 보존해 같은 호스트의 프로세스 재시작 후에도 재사용한다. 임시 파일시스템이나 여러 인스턴스의 공유 저장을 보장하지는 않는다.

운영 공개 전에는 다중 워커/인스턴스의 공용 캐시·전역 예산·프록시 신뢰·HTTPS·운영 모니터링을 결정해야 한다. 현재 가드는 로컬 개발용이며 운영 트래픽이나 SLA를 검증한 것이 아니다. 서버는 개인 피드백·신체·계정을 받지 않는다. 현재 위치 제안에 사용자가 제공한 좌표는 요청 처리에 쓰이지만 DB에 저장하지 않는다. 외부 프록시의 별도 로그까지 없는 것으로 주장하지 않는다.

## 테스트와 실제 확인

```powershell
./weather_api/.venv/Scripts/python.exe -m unittest discover -s weather_api/tests -v
./weather_api/.venv/Scripts/python.exe -m weather_api.verify_live
```

첫 명령은 실제 키/네트워크 없이 mock transport로 검증한다. 두 번째는 설정한 키로 실제 서울 마포구·강남구를 조회하며 한도를 사용한다. 키와 상류 요청 URL은 출력하지 않고, 결과는 무시된 `.cache/`에 저장한다. 매 테스트마다 실조회하지 않는다.

현재 캐시 보완 후 42개 테스트 통과. 초기 1단계에서는 27개 테스트와 다음 실조회를 확인했다. 두 지역에서 각각 36개 예보·1개 실황, 정상 상태와 캐시 재사용을 확인했고 로컬 HTTP 경로도 확인했다. [연동 확인 기록](../android/docs/WEATHER_INTEGRATION_STATUS.md)을 참고한다. 검증에 사용한 기존 환경의 Starlette TestClient에서 httpx 관련 폐기 예정 안내가 있었으나 테스트 실패는 없었다. 운영 의존성의 고정/분리 검증은 배포 전에 진행한다.

## 지역 자료와 출처

공식 [기상청 단기예보 서비스](https://www.data.go.kr/data/15084084/openapi.do)의 `기상청41_단기예보 조회서비스_오픈API활용가이드_2610.zip` 중 행정구역·격자·위경도 XLSX를 CSV로 정규화했다. [출처·체크섬](data/regions.source.json), [가져오기 코드](tools/import_regions.py)를 보존한다. 공공누리 제1유형의 출처를 유지한다.

```powershell
python -m weather_api.tools.import_regions weather_api/.cache/kma-guide-2610.zip
```

다운로드 원본은 `.cache/`에 있고 Git에서 제외한다. 새 공식 행정구역 자료로 갱신할 때 코드·격자·검색 결과를 검증하고 출처 버전도 함께 갱신한다. 근접 지점은 주소 판정이 아니며 지도/행정경계 자료를 대신하지 않는다.

공식 가이드 261019에서 단기예보 발표는 02/05/08/11/14/17/20/23시, API 제공은 각 10분 이후로 확인했다. 초단기실황은 매시 정각 기준 10분 이후를 사용한다. [기상청 예보업무 안내](https://www.kma.go.kr/kma/biz/forecast02.jsp)와 실제 응답을 함께 확인했다. UV·일출/일몰·대기질·체감온도는 이 단계에서 연결하지 않았고 없는 값을 만들지 않는다.

### 일일 호출 상한

환경변수 또는 이 폴더의 `.env`에 `KMA_DAILY_REQUEST_LIMIT`를 양의 정수로 설정한다. 실제 승인량보다 여유 있게 정한다. 빈 값은 집계만 하며, 현재 승인 한도를 임의로 추정하지 않는다. HTTP 페이지·실패·재시도를 요청 직전에 KST 날짜별 집계하고, 한도에 도달하면 상류 호출 전에 차단한다. 설정된 한도가 있는데 집계 DB가 열리지 않으면 요청을 보내지 않는다. 다른 프로그램이 같은 키로 사용한 양은 포함하지 않는다.
