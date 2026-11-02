# 아바타 Android 검증 결과

2026-11-02. 메인 앱 화면 구현 전, 승인한 품질의 3D 토이 렌더 이미지를 Android Compose에서 표시·전환하는 방식만 확인했다.

- [겉옷 없음 · 밝은 배경 · 240dp 높이](avatar-light-240dp.png)
- [재킷 착용 · 밝은 배경 · 240dp 높이](avatar-jacket-light-240dp.png)
- [재킷 착용 · 어두운 배경 · 320dp 높이](avatar-jacket-dark-320dp.png)
- [좁은 화면 · 320dp 폭](avatar-narrow-320dp-width.png)

`320dp 높이`와 `320dp 폭`은 다른 검증이다. 마지막 캡처는 840×1867 해상도, 420dpi로 약 320dp 폭을 확인한 것이다. 촬영 후 원래 1080×2400 해상도로 복원했다. 아래 내용은 세로 스크롤하여 접근한다.

자산은 [겉옷 없음](../../app/src/debug/res/drawable-nodpi/avatar_validation_long.png)과 [재킷 착용](../../app/src/debug/res/drawable-nodpi/avatar_validation_jacket.png) 두 개다. 내장 Imagegen을 사용했고 CLI 폴백은 사용하지 않았다. 프롬프트는 승인 홈의 인물을 고정하고 투명 배경의 긴팔·긴바지 전신 자산을 만들도록 했다. 배경 가장자리 처리를 후속 요청하고, 같은 얼굴·자세·캔버스·손발 위치를 유지하며 재킷만 추가하도록 편집했다. 정렬·투명 영역은 [매니페스트](../avatar-validation-manifest.json)에 기록했다. 미세한 알파 값이나 생성된 얼굴/외곽까지 완전히 동일하다는 뜻은 아니다.

`Image` + `painterResource` + `ContentScale.Fit`를 사용했다. 96dp 미리보기에서는 형태는 보이지만 소재/두께를 충분히 전달하지 못하므로 짧은 이름을 함께 둔다. 압축 파일 합은 약 3MB, 전체 해상도 RGBA 디코딩 버퍼는 단순 계산상 약 12MiB다. 실제 힙·프레임 성능을 측정하지 않았다. 제품에서는 해상도·압축·캐시 정책을 다시 정한다.

디버그 전용 [검증 화면](../../app/src/debug/java/com/pcrs/thermalguide/validation/AvatarValidationActivity.kt)과 manifest만 추가했다. 일반 홈 진입은 기존 골격이다. 릴리스 APK의 PNG 목록과 병합 manifest에서 검증 이미지·Activity가 빠지는 것을 확인했다. 날씨/추천/계정 의존성은 추가하지 않았다.

환경: PCRS Pixel 8 API 37 에뮬레이터. 첫 부팅 시 System UI 응답 지연이 발생했고 대기 후 정상 진행했다. 이후 배경·옷·크기 전환을 확인했다. 실기기·다른 Android 버전·장시간 반복·정량 성능·전체 제품의 글꼴 확대 검증은 아직이다.

실행 명령(디버그 APK 설치 후):

```powershell
& "$env:ANDROID_HOME/platform-tools/adb.exe" -s emulator-5556 shell am start -n com.pcrs.thermalguide/.validation.AvatarValidationActivity
```

키·네트워크·로그인 없이 실행된다. 최종 출시 자산이나 자유 의상 조합 구현으로 간주하지 않는다.
