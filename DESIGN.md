# DESIGN SYSTEM & UX SPEC — PCRS (v1.0)
> **Premium Personalized Comfort & Clothing Service**

이 문서는 PCRS 프로젝트의 UI/UX 일관성, 심미성, 사용성을 극대화하기 위해 작성된 **디자인 시스템 SSOT(Single Source of Truth)**입니다.

---

## 1. 현재 화면 진단 및 UI/UX 결함 (Heuristic Evaluation)

현재 컴파일 완료된 화면(Next.js Dev Server)을 분석한 결과, 다음 4가지 핵심적인 디자인/UX 개선 포인트가 식별되었습니다.

### 🚨 [결함 1] 번역 누락 슬롭 (Translation Slop)
*   **현상**: 헤더 우측의 인증 버튼에 번역 키 값인 `header.login_short`가 날것으로 노출되고 있음.
*   **해결책**: i18n 번역 파일(`src/i18n/`)에서 해당 키의 누락을 점검하고, 다국어 전환(`ko`, `en`, `ja`) 시 즉각 대응되도록 하거나 적절한 Fallback 텍스트(예: `"로그인"`, `"Login"`)를 적용해야 함.

### 🔄 [결함 2] 수동 액션 요구 UX (Empty State Friction)
*   **현상**: 화면 진입 시 모든 분석 영역이 텅 빈 채로 "분석 버튼을 눌러주세요"라는 문구만 노출됨. 유저에게 첫 불필요한 행동(클릭)을 강제함.
*   **해결책**: **"Zero-Click UX"** 지향. 유저가 진입하면 브라우저 GPS 권한 여부를 확인하고, 동의 시 즉시 좌표 기반 백엔드 추천을 자동으로 로드하여 화면을 풍성하게 채우고, 로딩 중에는 아름다운 **스켈레톤(Skeleton) 애니메이션**을 노출함.

### 🎨 [결함 3] 비주얼 플랫함 (Visual Flatness)
*   **현상**: 실시간 AI 맞춤 솔루션의 3종 가이드 카드가 밋밋한 회색 테두리와 단조로운 아이콘으로 구성되어 프리미엄한 "초개인화 케어"의 느낌을 주지 못함.
*   **해결책**: 글래스모피즘(`backdrop-filter: blur`) 깊이를 강화하고, 각 카드(의류, 수분, 행동)의 고유 테마 컬러(예: 의류 - 파스텔 블루, 수분 - 테아릴 블루, 행동 - 따뜻한 앰버)의 소프트 그라데이션 백그라운드 오버레이를 적용함.

### 📊 [결함 4] 차트 시각 디테일 부족
*   **현상**: 시간별 체감 분석 차트(Recharts)가 로딩 전후에 0선에 걸친 얇은 단색 라인만 보여주어 감흥이 없음.
*   **해결책**: 라인 하단에 그라데이션 채우기(Area Chart 형태로 보완)를 적용하고, UTCI 스트레스 경계구간(예: 32°C 이상 붉은 영역)에 은은한 **가로 참조 밴드(Reference Band)**를 채워 시각적인 직관성을 극대화함.

---

## 2. 디자인 토큰 및 가이드라인 (Design Tokens)

### 2.1 컬러 시스템 (UTCI 9단계 동적 컬러 테마)

사용자의 현재 체감 환경(UTCI)에 따라 앱의 전반적인 분위기(헤더, 게이지, 차트 포인트 컬러)가 변화합니다.

| UTCI 온도 구간 | 상태 분류 | 대표 색상 | CSS / Tailwind |
|:---|:---:|:---:|:---|
| **> 46°C** | 극도의 열 스트레스 | 딥 레드 | `#B71C1C` / `text-rose-800 bg-rose-500/10` |
| **32°C ~ 38°C** | 강한 열 스트레스 | 토마토 레드 | `#FF7043` / `text-orange-700 bg-orange-500/10` |
| **9°C ~ 26°C** | 열적 쾌적 | 에메랄드 그린 | `#4FC3F7` / `text-emerald-700 bg-emerald-500/10` |
| **-13°C ~ 0°C** | 보통 추운 스트레스 | 스카이 블루 | `#5C6BC0` / `text-sky-700 bg-sky-500/10` |
| **< -27°C** | 극도의 추운 스트레스 | 딥 퍼플 | `#4527A0` / `text-indigo-800 bg-indigo-500/10` |

### 2.2 타이포그래피 (Typography)
*   **기본 폰트**: Pretendard (한글 렌더링 가독성 극대화)
*   **숫자 및 영문**: Inter 또는 Outfit (샤프하고 미래지향적인 폰트 사용)
*   **강조(Bold)**: 타이틀 영역은 `font-black` (`900`)을 적극 사용하여 글래스모피즘 요소들과의 명확한 대비를 이끌어냄.

---

## 3. 프리미엄 컴포넌트 개선 스펙 (Refactoring Design Guide)

### 3.1 넛지 경고 배너 & 로딩 스켈레톤

데이터 분석 중에는 가만히 멈춘 스피너 대신, 펄스 애니메이션이 도는 형태의 스켈레톤을 씁니다.

```tsx
// 스켈레톤 예시
<div className="animate-pulse flex flex-col gap-3">
  <div className="h-6 w-1/3 bg-slate-800/40 rounded-lg" />
  <div className="h-20 w-full bg-slate-800/20 rounded-2xl" />
</div>
```

### 3.2 개인화 넛지 카드 테마
*   `nudge_warning`이 `true` 일 때:
    - 테두리: `border-rose-500/30`
    - 내부 흐름 광원: `bg-gradient-to-r from-rose-500/10 to-orange-500/5`
    - 아이콘: 경고 아이콘의 부드러운 펄스 애니메이션(`animate-pulse`) 적용

---

## 4. 실천 로드맵 (Action Items)

1.  **다국어 i18n 점검**: `src/i18n/` 디렉토리 내 JSON 파일들에서 `header.login_short`에 대한 번역 값 복구.
2.  **자동 GPS 로드 구현**: `useEffect` 내에서 최초 브라우저 렌더링 직후 사용자의 위치 정보를 확인하고 즉각 `handleAnalyzeAllHours()`를 백그라운드 호출하도록 수정.
3.  **UI 비주얼 고도화**:
    - AI 솔루션 카드의 배경에 흐린 파스텔톤 입체적 그라데이션 및 블러 필터 가미.
    - Recharts 라인 하단 부드러운 그라데이션 그늘막(`LinearGradient` Area) 채우기 적용.
