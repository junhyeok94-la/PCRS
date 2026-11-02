# Thermal Guide / PCRS

현재 개발 대상은 **Android 네이티브 앱**입니다. Kotlin과 Jetpack Compose로 빈 앱부터 기능을 하나씩 구현합니다.

- [Android 앱 시작하기](android/README.md)
- [출퇴근·선택 민감도 구현 결과](android/docs/PERSONALIZATION_IMPLEMENTATION_STATUS.md)
- [출퇴근·설정 실제 검증 화면](android/design/personal-validation/README.md)
- [날씨 캐시·호출 자원 관리](android/docs/CACHE_IMPLEMENTATION_STATUS.md)
- [백엔드 자원 사용 원칙](weather_api/DEVELOPMENT_RESOURCE_POLICY.md)
- [아바타 착장 8종 보기](android/design/avatar-assets-v1/index.html)
- [지역 기본 의상 추천 구현](android/docs/RECOMMENDATION_IMPLEMENTATION_STATUS.md)
- [실제 추천 화면](android/design/recommendation/README.md)
- [실제 날씨 홈 구현 결과](android/docs/HOME_IMPLEMENTATION_STATUS.md)
- [실제 앱 화면](android/design/implementation/README.md)
- [제품 개발 기술 검토](android/docs/PRODUCT_TECH_REVIEW.md)
- [날씨 연동 1단계 결과](android/docs/WEATHER_INTEGRATION_STATUS.md)
- [독립 날씨 API 실행](weather_api/README.md)
- [Android 아바타 표시 검증](android/design/validation/README.md)
- [최신 디자인 검토 모음](android/docs/DESIGN_REVIEW_V0_4.md)
- [화면 시안 모아 보기](android/design/review.html)
- [현재 컨셉의 개발 순서](android/docs/DEVELOPMENT_PLAN_V0_4.md)
- [기능별 개발 순서와 완료 기준](android/docs/DEVELOPMENT_PLAN.md)
- [앱 구조와 기존 서버 검토](android/docs/ARCHITECTURE.md)

`frontend/`, `backend/`, `batch/`는 이전 웹 구현으로 보관합니다. 새 앱은 독립 `weather_api/`를 통해 기상청 자료를 받고, 이전 웹 서버·Supabase 서비스에는 연결하지 않습니다. 로컬 서버 실행에 기존 Python 가상환경을 개발 도구로 사용하고 있습니다.

`PROJECT_SPEC.md`와 `BETA_DEPLOYMENT.md`는 이전 웹 버전의 설계·배포 자료입니다. Android 개발 범위와 진행 상태는 위의 앱 문서를 기준으로 합니다.

이전 웹 버전의 기능·배포 소개는 [보관된 웹 README](docs/WEB_PROJECT_README.md)에서 확인할 수 있습니다.
