# 아바타 착장 8종 · 구현 검증

2026-11-02. 내장 image_gen으로 기존 캐릭터를 참조해 새 의류 6종을 제작하고 기존 2종과 함께 Android에 연결했다. [밝고 어두운 배경에서 8종 보기](index.html) · [구현 결과와 한계](../../docs/AVATAR_ASSET_IMPLEMENTATION_STATUS.md).

## 저장 파일

앱 원본은 `android/app/src/main/res/drawable-nodpi/`에 있다. 기존 파일을 덮어쓰지 않았다.

| 착장 | 앱에 저장한 PNG |
|---|---|
| 긴팔·일반 바지 | [avatar_preview_long.png](../../app/src/main/res/drawable-nodpi/avatar_preview_long.png) |
| 재킷 입기 | [avatar_preview_jacket.png](../../app/src/main/res/drawable-nodpi/avatar_preview_jacket.png) |
| 가디건 입기 | [avatar_outfit_cardigan_v1.png](../../app/src/main/res/drawable-nodpi/avatar_outfit_cardigan_v1.png) |
| 긴팔·얇은 바지 | [avatar_outfit_thin_light_v1.png](../../app/src/main/res/drawable-nodpi/avatar_outfit_thin_light_v1.png) |
| 반팔·얇은 바지 | [avatar_outfit_short_light_v1.png](../../app/src/main/res/drawable-nodpi/avatar_outfit_short_light_v1.png) |
| 니트·중간 재킷 | [avatar_outfit_mid_jacket_v1.png](../../app/src/main/res/drawable-nodpi/avatar_outfit_mid_jacket_v1.png) |
| 니트·코트 | [avatar_outfit_coat_v1.png](../../app/src/main/res/drawable-nodpi/avatar_outfit_coat_v1.png) |
| 내의·니트·패딩 | [avatar_outfit_padded_v1.png](../../app/src/main/res/drawable-nodpi/avatar_outfit_padded_v1.png) |

## 실제 앱 캡처

| 확인 내용 | 캡처 |
|---|---|
| 실제 강남구 21시 예보·코트 추천 | [일반 홈 코트](screenshots/main-coat.png) |
| 실제 강남구 15시 예보·가디건 대안 | [일반 홈 가디건](screenshots/main-cardigan.png) |
| 가디건 254dp / 320dp | [밝음](screenshots/light-4.png) · [어두움](screenshots/dark-4.png) |
| 코트 254dp / 320dp | [밝음](screenshots/light-6.png) · [어두움](screenshots/dark-6.png) |
| 패딩 254dp / 320dp / 96dp | [밝음](screenshots/light-7.png) · [어두움](screenshots/dark-7.png) · [작은 크기](screenshots/padded-96dp.png) |
| 재킷·가디건 챙기기 | [재킷 휴대](screenshots/light-2.png) · [가디건 휴대](screenshots/light-8.png) |
| 320dp 폭·글꼴 1.3·어두운 배경 | [코트](screenshots/narrow-coat.png) |

일반 홈은 실제 예보, 검증 전용 화면은 의류 조합 고정 입력이다. 검증 화면은 날씨 화면이 아니며 제품 흐름에서 접근할 수 없고 릴리스에서 제외된다. 캡처의 날씨 수치는 당시 자료다. 나머지 전체 착장의 밝고 어두운 배경 캡처와 UI 계층 XML도 screenshots 폴더에 보존했다.

8장 모두 1024×1536 RGBA, 발 끝 기준선 ±2px와 투명도 점검을 통과했다. 겉옷 ON/OFF·니트/재킷/코트/패딩의 형태와 손발 잘림·명암 배경 외곽을 확인했다. 생성 이미지의 미세한 인물 차이는 남으며, 특히 가디건의 머리 상단 위치가 약 13px 다르다. 자유 의상 조합·실시간 3D·임의 체형 꾸미기를 지원하는 것은 아니다.

빌드·테스트 31개·lint 오류 0(경고 12개). 릴리스 APK에서 실제 drawable 8종 포함과 디버그 검증 Activity 제외를 확인했다. 소스 PNG 합계 약 12.6MB, 빌드 산출물은 디버그 29,144,224바이트·릴리스 unsigned 15,572,884바이트였다. 리소스 최적화는 Android 빌드 도구가 수행하며 런타임 AI 생성은 없다.

[최종 프롬프트](prompts.json) · [생성 이력](generation.json) · [SHA-256·알파·크기 기록](manifest.json). 내장 도구를 사용했으며 외부 API 키·CLI는 사용하지 않았다. 생성 원본은 기본 생성 폴더에 남겨 두고 앱 사본을 사용했다.
