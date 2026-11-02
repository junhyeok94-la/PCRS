# 시안 생성과 보존 기록

2026-11-02. 모든 PNG는 내장 Imagegen으로 생성한 래스터 시안이며 CLI/API 폴백을 사용하지 않았다. 아래 프롬프트는 최종 생성 지시의 핵심을 재현할 수 있게 정리한 요약이다. 전체 원문 도구 입력을 그대로 복사한 기록은 아니다. 이미지의 표기나 선택 상태가 확정 사양인 것은 아니며 화면 명세를 우선한다.

## 공통 프롬프트 기준

Use case: ui-mockup. Korean Android weather app. Pale sky-blue background, warm-white rounded cards, dark navy Korean typography, restrained medium-blue selection/action. Static fictional data, subtle ‘디자인 예시’. Same approved matte 3D toy identity when avatar appears. Concise content, meaningful icons and values, no device frame/perspective, no shopping or accuracy claims. Preserve region-only first entry and optional personalization. Save successful state only after actual write; candidate selection is not proof of wearing.

| 결과 | 최종 프롬프트의 핵심 구성 |
|---|---|
| home-toy-v1.png | 현재19도/시간별/오늘의 나/상세4지표/고정탭. 귀가 상태의 재킷 캐릭터와 의류별 그림·이름 |
| outfit-alternatives-v2.png | 큰 전신1개+이전/다음, 작은 착장3개, 선택 이유1줄, 의류3항목·탈착, ‘오늘 이 차림으로’ |
| feedback-flow-v1.png | 기본과 더움의 2화면. 경험 시점·예보·실제착장·온열감, 더움 강도·환경·복수상황·불일치 펼침 |
| actual-outfit-v1.png | 실제 착장 수정. 겉옷 벗은 아바타, 입음/휴대/없음, 종류·두께, 부모 초안으로 복귀 |
| onboarding-basic-home-v1.png | 2화면. 수동 지역 검색/선택 및 선택적 현재위치, 지역 하나로 시작. 기본홈은 시간 숫자만, 출퇴근·도보·민감도 미설정 표시 |
| hourly-commute-v1.png | 2화면. 선택 지역의 시계열+두 지역 비교요약, 장소2·이동 시작시각2만 출퇴근 설정 |
| settings-sensitivity-alert-v1.png | 3화면. 설정 목록, 독립적인 더위/추위 미선택, 선택 신체정보, 기본OFF 알림·시간·요일·권한 |
| weather-error-stale-v1.png | 2화면. 무자료 실패에 온도/추천 없음, 캐시화면에 갱신실패·기준/수신시각. 최종 수정에서 홈의 승인 캐릭터로 교체 |
| feedback-cold-mismatch-saved-v1.png | 3화면. 추움 강도/상황, 당시 예보와 다른 주관적 보고, 저장완료 요약·홈/기록수정 |
| optional-settings-v1.png | 2화면. 선택 요일·복수 교통수단·도보 범주·주요 실내외 환경, 선택 키·몸무게의 단위·비움·취소 |
| history-reset-delete-v1.png | 3화면. 날짜별 기록, 기록/설정을 보존하는 보정 초기화, 기록과 해당 보정 기여를 삭제하는 별도 확인 |

## 참고·수정 기록

새 시안은 대화의 승인된 이미지들을 시각 참조로 사용했다. 조회 실패/캐시 보드의 최초 결과에 캐릭터 정체성 변화가 있어, 원본 보드를 편집 대상으로 하고 승인된 home-toy-v1을 인물 참조로 지정하여 캐릭터 부분만 수정했다. 최종 수정본만 프로젝트 시안으로 저장했다. 원래 생성 결과는 기본 생성 경로에 그대로 남아 있다.

‘다른 차림’ v1은 이력으로 보존한다. 확정 비교 방향은 v2다. 기존 코드 기반 임시 그림을 최종 아바타 스타일로 되돌리지 않는다. 현 PNG는 잘라서 제품 자산으로 쓰거나 자유로운 착장 조합이 가능하다고 가정하지 않는다.
