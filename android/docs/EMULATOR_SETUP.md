# 에뮬레이터와 Mobile MCP

확인일: 2026-11-01.

## 현재 PC의 구성

- 가상 기기: `PCRS_Pixel_8_API_37` (Pixel 8, 설치된 API 37 Google Play x86_64 이미지)
- SDK: `C:\Users\skwns\AppData\Local\Android\Sdk`
- Android 명령행 도구: SDK의 `cmdline-tools/latest`
- Windows Hypervisor Platform 가속 사용 가능 확인
- Mobile MCP: `@mobilenext/mobile-mcp@1.0.15`, Node 24로 실행
- 앱: `com.pcrs.thermalguide`

## 가상 기기 실행

Android Studio Device Manager에서 `PCRS_Pixel_8_API_37`의 실행 버튼을 누릅니다. 명령행으로 실행할 수도 있습니다.

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -avd PCRS_Pixel_8_API_37
```

첫 부팅은 시간이 걸립니다. ADB에서 `offline`으로 보이면 부팅 완료 전인지 먼저 확인합니다. 이미 같은 기기가 실행 중이라면 추가 실행하지 않습니다.

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices -l
```

이 PC에서 최초 검증 시 ADB 식별자는 `emulator-5556`이었습니다. ADB 식별자는 실행 포트에 따라 달라질 수 있습니다.

## Mobile MCP 연결

프로젝트 루트의 `.codex/config.toml`에 `mobile` 서버를 등록했습니다. SDK·Node의 PC별 경로가 들어 있으므로 이 파일은 Git에서 제외합니다. 서버 패키지는 `android/.gradle/mobile-mcp`에 설치했으며 외부 HTTP 포트를 열지 않고 stdio로 실행합니다.

패키지를 다시 설치해야 할 때:

```powershell
cd D:\01.DEV\PCRS\android
npm.cmd install --prefix .gradle/mobile-mcp --no-audit --no-fund --ignore-scripts @mobilenext/mobile-mcp@1.0.15
```

Codex에서 새 MCP 도구가 표시되지 않으면 설정을 다시 로드하거나 앱을 재시작한 뒤 같은 프로젝트를 엽니다. `mobile_list_available_devices`가 가상 기기를 반환하는지 확인합니다.

**MCP가 반환한 기기 ID를 그대로 사용합니다.** 이번 버전에서는 `PCRS_Pixel_8_API_37`을 반환했으며, ADB 식별자 `emulator-5556`과 달랐습니다.

이번 검증에서는 로컬 stdio MCP 클라이언트로 서버를 직접 호출했습니다. 기기 목록 조회, 앱 실행, UI 요소 읽기, 탭 클릭이 실제로 동작했습니다. 실행 중인 Codex 채팅의 도구 목록에 서버가 자동 반영됐다는 의미는 아닙니다.

## 확인한 화면

홈의 ‘오늘, 무엇을 입을까요?’, 시간별의 ‘활동하기 좋은 시간’, 옷장의 ‘나의 옷장’, 설정의 ‘나에게 맞는 설정’을 UI 트리에서 확인했습니다. Mobile MCP로 각 탭을 눌러 전환했습니다.

API 26 등 다른 버전·화면 크기와 회전·다크 모드·큰 글꼴 검증은 별도로 진행합니다.

## 참고

- [Mobile MCP 제공자 문서](https://github.com/mobile-next/mobile-mcp)
- [Codex MCP 설정](https://developers.openai.com/codex/mcp/)
- [Android Emulator 안내](https://developer.android.com/studio/run/emulator)
