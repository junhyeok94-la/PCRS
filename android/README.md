# Thermal Guide Android

Kotlin · Jetpack Compose로 개발하는 대한민국 우선 날씨 앱입니다. Android 8.0(API 26) 이상을 대상으로 합니다.

2026-11-02: **출퇴근과 선택 성향을 반영한 의상 추천을 연결했습니다.** 지역 하나로 시작하고, 설정에서 집·직장·출발 시각·요일과 독립적인 더위/추위 성향·이동·실내 환경을 추가할 수 있습니다. 출근과 귀가의 실제 지역·예보에 맞는 차림과 기존 착장 8종을 표시합니다. 직접 설정 기반 초기 규칙이며 개인 최적화 효과는 검증 전입니다. 다음은 구조화 피드백입니다.

- [출퇴근·민감도 구현 결과](docs/PERSONALIZATION_IMPLEMENTATION_STATUS.md) · [실제 검증 화면](design/personal-validation/README.md)

- [날씨 디스크 캐시·호출 관리](docs/CACHE_IMPLEMENTATION_STATUS.md)
- [아바타 착장 8종](design/avatar-assets-v1/index.html) · [착장 구현 결과](docs/AVATAR_ASSET_IMPLEMENTATION_STATUS.md)
- [추천 구현 결과](docs/RECOMMENDATION_IMPLEMENTATION_STATUS.md) · [추천 기준표](docs/RECOMMENDATION_RULES_V0_1.md)
- [추천 화면](design/recommendation/README.md)
- [날씨 홈 1차 구현 범위와 검증](docs/HOME_IMPLEMENTATION_STATUS.md)
- [실제 앱 화면](design/implementation/README.md)
- [개발 순서](docs/DEVELOPMENT_PLAN_V0_4.md)
- [제품 기술 검토](docs/PRODUCT_TECH_REVIEW.md)
- [날씨 서버 검증](docs/WEATHER_INTEGRATION_STATUS.md)
- [디자인 시안 모음](design/review.html) · [화면 동작 명세](docs/SCREEN_SPEC_V0_4.md)

## 실행

1. [독립 날씨 API](../weather_api/README.md)를 PC의 127.0.0.1:8010에서 실행합니다. 기상청 키는 서버의 .env에만 설정합니다.
2. Android Studio에서 **android 폴더**를 엽니다. Gradle JDK는 17 또는 21, Android SDK Platform 36을 사용합니다. 현재 PC는 JBR 21로 확인했습니다.
3. 에뮬레이터에서 app의 MainActivity를 실행합니다. 첫 화면에서 지역 하나를 골라 시작합니다. 디버그 서버 주소는 http://10.0.2.2:8010입니다.

```powershell
cd D:\01.DEV\PCRS\android
$env:JAVA_HOME = 'C:\Users\skwns\.jdks\jbr-21.0.11'
$env:ANDROID_HOME = 'C:\Users\skwns\AppData\Local\Android\Sdk'
.\gradlew.bat :app:assembleDebug :app:testDebugUnitTest :app:lintDebug :app:assembleRelease
```

디버그 APK: app/build/outputs/apk/debug/app-debug.apk. 릴리스 서버 주소는 Gradle 속성 weatherApiBaseUrl에 HTTPS로 지정해야 합니다. 기본값이 비어 있어 현재 릴리스 빌드는 배포용 서비스에 연결하지 않습니다. API 키·서명 키·local.properties는 Git에 포함하지 않습니다.

## 코드 배치

```text
app/src/main/java/com/pcrs/thermalguide/
  MainActivity.kt
  app/                     진입·3탭·Back·화면 상태
  core/weather/            모델·JSON 계약·통신·지역 저장·ViewModel
  core/recommendation/     버전 있는 추천 규칙·의류·아바타 매핑
  core/ui/                 날씨 아이콘·공통 UI·테마
  feature/region/           지역 검색·선택
  feature/home/             실제 날씨·기본 차림·상세
  feature/hourly/           시간별 그래프·목록
  feature/settings/         기준 지역·자료 안내
```

지역은 DataStore에, 날씨는 앱 전용 디스크 캐시에 분리해 저장합니다. 재실행 시 저장 자료를 먼저 읽고 유효한 예보·실황이 있으면 자동 조회를 생략합니다. 갱신 실패·만료 자료는 별도로 표시합니다. 로그인·개인 DB·광고 SDK·위치 권한은 현재 연결하지 않았습니다. 과거 옷장 탭은 제거했습니다.

Gradle 8.13 / AGP 8.13.2 / Kotlin 2.2.21 / Compose BOM 2025.12.01 / compile·target SDK 36. 버전은 gradle/libs.versions.toml에서 관리합니다. Gradle 배포 ZIP의 SHA-256은 래퍼 설정에 고정했습니다.

[에뮬레이터 안내](docs/EMULATOR_SETUP.md) · [디버그 전용 아바타 검증 이력](design/validation/README.md). Figma v0.3과 예전 빈 4탭은 과거 이력이며 현재 상태는 위 구현 문서를 따릅니다.
