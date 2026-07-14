// 한국어 번역 (기본값 — 기존 UI 텍스트)
const ko = {
  // 헤더
  "header.title": "THERMAL GUIDE",
  "header.guest": "게스트 (로그인/가입)",
  "header.guest_short": "게스트",
  "header.guest_feedback": "임시 피드백 활성",
  "header.logout": "로그아웃",
  "header.profile": "개인화 필셋",

  // 신체 스펙 카드
  "body.title": "개인 신체 스펙 설정",
  "body.height": "신장 (cm)",
  "body.weight": "체중 (kg)",
  "body.fat": "체지방 (%)",
  "body.gender": "성별",
  "body.male": "남성 [ MALE ]",
  "body.female": "여성 [ FEMALE ]",
  "body.env": "활동 환경",
  "body.indoor": "🏠 실내 공조 (HVAC)",
  "body.outdoor": "🌀 실외 자연풍 (Outdoor)",
  "body.analyze": "분석 결과 업데이트 (UPDATE ANALYSIS)",
  "body.analyzing": "업데이트 분석 중...",
  "body.summary_height": "신장",
  "body.summary_weight": "체중",
  "body.summary_fat": "체지방",

  // 시간대 슬라이더
  "time.title": "시간대별 체감 분석 (TIME-SPECIFIC ANALYSIS)",
  "time.current": "(현재)",
  "time.desc": "*시간의 흐름에 따른 외부 기상 상황 및 기류 변화를 매핑해 실시간 체감 온도를 추적합니다.",

  // 온열 프로필
  "thermal.title": "실시간 온열 부하 분석 (YOUR THERMAL PROFILE)",
  "thermal.loading": "PMV 연산 중...",
  "thermal.empty": "분석 버튼을 눌러 결과를 확인하세요.",
  "thermal.status_label": "체감 온열 등급",
  "thermal.pmv_label": "PMV 지수",
  "thermal.feedback_q": "이 추천 옷차림에 대한 체감은?",
  "thermal.too_hot": "🥵 더움",
  "thermal.good": "😊 적당",
  "thermal.too_cold": "🥶 추움",
  "thermal.pmv_desc": "*PMV(Predicted Mean Vote): ISO 7730 표준 온열 지표로, 단순 기온을 넘어 당신의 신체 대사량과 땀 배출 능력을 반영한 온도 부하도입니다.",

  // 위치 정보
  "location.title": "현재 위치 정보",
  "location.sido": "시도",
  "location.sigungu": "시군구",
  "location.map_desc": "선택된 지역의 실시간 기상 데이터를 기반으로 PMV를 계산합니다.",

  // 날씨 위젯
  "weather.title": "실시간 기상 관측 정보",
  "weather.temp": "기온",
  "weather.humidity": "습도",
  "weather.wind": "풍속",

  // AI 솔루션
  "ai.title": "실시간 AI 맞춤 솔루션 (REAL-TIME AI GUIDANCE)",
  "ai.powered": "Powered by Gemini Pro",
  "ai.summary_title": "💡 종합 신체-기류 체감 요약",
  "ai.clothing": "의류 권장 가이드",
  "ai.hydration": "수분 섭취 가이드",
  "ai.activity": "행동 및 외부 활동 가이드",
  "ai.loading": "분석 중...",
  "ai.empty": "분석 버튼을 눌러주세요.",
  "ai.reset": "기본값 스펙 리셋",
  "ai.feedback_applied": "[개인화 피드백 보정 적용됨: Bias = ",
  "ai.clo_final": ", 최종 CLO = ",

  // 공유
  "share.copy": "링크 복사",
  "share.save": "이미지 저장",
  "share.copied": "링크가 클립보드에 복사되었습니다!",
  "share.copy_fail": "링크 복사에 실패했습니다.",

  // 유사 추천
  "similar.title": "유사 신체 스펙 추천 가이드 (SIMILAR USER RECOMMENDATIONS)",
  "similar.badge": "인간공학 매치",
  "similar.empty": "분석 후 유사 스펙 추천이 표시됩니다.",

  // 체지방 가이드
  "bodyfat.guide_title": "체지방률 시각 가이드 (BODY FAT GUIDE)",
  "bodyfat.guide_desc": "자신의 체형에 가까운 슬롯을 선택하면 체지방률이 자동 입력됩니다.",
  "bodyfat.male": "남성 체형 (MALE)",
  "bodyfat.female": "여성 체형 (FEMALE)",
  "bodyfat.apply": "이 값으로 적용",
  "bodyfat.close": "닫기",
  "bodyfat.athlete_title_m": "🥇 운동선수형 (10 ~ 12%)",
  "bodyfat.athlete_desc_m": "체지방이 거의 없고 근육 윤곽과 혈관이 선명하게 발달한 체형.",
  "bodyfat.fit_title_m": "🏋️ 핏/웰빙형 (13 ~ 17%)",
  "bodyfat.fit_desc_m": "복부 복근이 살짝 비치며 전반적으로 탄탄하고 건강미가 있는 체형.",
  "bodyfat.normal_title_m": "🏃 보통/일반형 (18 ~ 22%)",
  "bodyfat.normal_desc_m": "비만하지 않고 특별한 트레이닝 흔적이 덜하지만 균형 잡힌 표준 체형.",
  "bodyfat.overweight_title_m": "🐷 과체중형 (25% 이상)",
  "bodyfat.overweight_desc_m": "허리와 복부 주변에 살집이 잡히며 바디 라인이 둥글고 부드러운 체형.",
  "bodyfat.athlete_title_f": "🥇 운동선수형 (18 ~ 20%)",
  "bodyfat.athlete_desc_f": "지방이 최소화되어 복직근 갈래와 신체 실루엣이 탄탄히 조각된 체형.",
  "bodyfat.fit_title_f": "🏋️ 핏/웰빙형 (21 ~ 24%)",
  "bodyfat.fit_desc_f": "허벅지와 팔 등에 적당한 근육 톤이 돌고 허리 라인이 슬림한 체형.",
  "bodyfat.normal_title_f": "🏃 보통/일반형 (25 ~ 31%)",
  "bodyfat.normal_desc_f": "굴곡이 자연스러우며 여성 기준의 가장 보편적이고 균형 잡힌 표준 체형.",
  "bodyfat.overweight_title_f": "🐷 과체중형 (32% 이상)",
  "bodyfat.overweight_desc_f": "엉덩이와 아랫배 쪽에 피하지방 축적이 두드러지며 라인이 둥근 체형.",

  // 피드백 토스트
  "toast.feedback_ok": "피드백이 반영되었습니다. 추천을 다시 업데이트합니다.",
  "toast.feedback_fail": "피드백 전송에 실패했습니다. 잠시 후 다시 시도하세요.",
  "toast.network_error": "네트워크 오류가 발생했습니다.",

  // 인증 모달
  "auth.login": "Supabase 개인 계정 로그인",
  "auth.signup": "개인 계정 회원가입",
  "auth.email": "이메일",
  "auth.password": "비밀번호",
  "auth.submit_login": "로그인",
  "auth.submit_signup": "회원가입",
  "auth.switch_signup": "계정이 없으신가요? 회원가입",
  "auth.switch_login": "이미 계정이 있으신가요? 로그인",
  "auth.close": "✕ 닫기",
};

export default ko;
