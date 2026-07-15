"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { useTranslation } from "@/i18n/useTranslation";

import { 
  ComposedChart,
  AreaChart,
  Area,
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  ReferenceLine 
} from "recharts";

// ─── Recharts 선형 차트 커스텀 툴팁 컴포넌트 ───
const CustomChartTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-slate-900/95 border border-slate-700/80 p-3 rounded-2xl shadow-xl backdrop-blur-md text-white flex flex-col gap-1.5 z-50">
        <div className="flex justify-between items-center gap-4">
          <span className="text-[10px] font-black text-blue-400">{data.time}</span>
          <span className="text-[9px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded-full font-bold">
            {data.sensation || "분석 완료"}
          </span>
        </div>
        <div className="flex flex-col text-xs font-bold gap-0.5 mt-0.5">
          <div className="flex justify-between gap-6 text-slate-300">
            <span>체감 온도:</span>
            <span className="text-white font-black">{data["체감 온도"]}°C</span>
          </div>
          <div className="flex justify-between gap-6 text-slate-400 text-[10px]">
            <span>실제 기온:</span>
            <span>{data["실제 기온"]}°C</span>
          </div>
        </div>
        {data.clothing && data.clothing.length > 0 && (
          <div className="border-t border-slate-800 pt-1.5 mt-1">
            <span className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">추천 착장</span>
            <p className="text-[10px] text-indigo-300 font-extrabold mt-0.5 leading-snug">
              {data.clothing.join(", ")}
            </p>
          </div>
        )}

      </div>
    );
  }
  return null;
};

const SUPABASE_URL = "https://bdkvcrvmzeghburhcdut.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJka3ZjcnZtemVnaGJ1cmhjZHV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MTI1OTEsImV4cCI6MjA5ODI4ODU5MX0.PVvfBdIbLmhOwhXN5vJc9kiNxPjkRTgwnO6JjgzU5P8";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
import { 
  Thermometer, 
  MapPin, 
  Map, 
  User, 
  Wind, 
  Sliders, 
  Shirt, 
  Droplet, 
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Loader2,
  Bell,
  ChevronRight,
  ChevronDown,
  HelpCircle,
  Share2,
  Globe,
  Link2,
  ImageDown,
  Settings,
  X
} from "lucide-react";

interface RecommendationData {
  utci?: number;
  utci_personalized?: number;
  utci_category?: string;
  pmv: number;
  thermal_sensation: string;
  recommendations: {
    clothing: string[];
    activity: string;
    hydration: string;
    user_clo_bias?: number;
    clo_applied?: number;
    met_applied?: number;
    avatar_state?: 'sweating' | 'hot' | 'slightly_hot' | 'comfortable' | 'slightly_cold' | 'cold' | 'shivering';
    clothing_codes?: string[];
  };
  weather?: {
    temperature: number;
    humidity: number;
    wind_speed: number;
    tmrt?: number;
    source: string;
  };
  body_params?: {
    bsa?: number;
    met?: number;
    age_offset?: number;
    fat_offset?: number;
  };
  nudge?: {
    nudge_warning: boolean;
    nudge_message: string;
    diff_temp: number;
  };
}

interface RegionMap {
  [sido: string]: string[];
}

const getThemeStyles = (utciOrPmv: number | undefined) => {
  if (utciOrPmv === undefined) {
    return {
      bg: "bg-slate-100",
      gradientRight: "bg-blue-400/10",
      gradientLeft: "bg-slate-300/20",
      accent: "text-blue-500",
      borderAccent: "border-blue-500/20",
      button: "border-blue-600 hover:bg-blue-50 text-blue-600"
    };
  }
  // UTCI 9단계 기준 테마 그라데이션
  if (utciOrPmv > 38) {
    // 매우 더움 (+3) - Intense Rose/Red
    return {
      bg: "bg-rose-50/50",
      gradientRight: "bg-rose-500/20",
      gradientLeft: "bg-red-400/25",
      accent: "text-rose-600",
      borderAccent: "border-rose-500/30",
      button: "border-rose-600 hover:bg-rose-50 text-rose-600"
    };
  } else if (utciOrPmv > 26) {
    // 보통 열 스트레스 - Orange
    return {
      bg: "bg-orange-50/40",
      gradientRight: "bg-orange-400/15",
      gradientLeft: "bg-amber-400/15",
      accent: "text-orange-600",
      borderAccent: "border-orange-500/20",
      button: "border-orange-600 hover:bg-orange-50 text-orange-600"
    };
  } else if (utciOrPmv > 9) {
    // 쾌적 - Emerald
    return {
      bg: "bg-emerald-50/40",
      gradientRight: "bg-emerald-400/15",
      gradientLeft: "bg-teal-300/20",
      accent: "text-emerald-600",
      borderAccent: "border-emerald-500/20",
      button: "border-emerald-600 hover:bg-emerald-50 text-emerald-600"
    };
  } else if (utciOrPmv >= 0) {
    // 약간 추운 - Teal/Cyan
    return {
      bg: "bg-teal-50/30",
      gradientRight: "bg-teal-400/10",
      gradientLeft: "bg-cyan-300/10",
      accent: "text-teal-600",
      borderAccent: "border-teal-500/15",
      button: "border-teal-600 hover:bg-teal-50 text-teal-600"
    };
  } else if (utciOrPmv >= -13) {
    // 추운 - Sky/Blue
    return {
      bg: "bg-sky-50/40",
      gradientRight: "bg-sky-400/15",
      gradientLeft: "bg-blue-400/15",
      accent: "text-sky-600",
      borderAccent: "border-sky-500/20",
      button: "border-sky-600 hover:bg-sky-50 text-sky-600"
    };
  } else {
    // 매우 추운 - Indigo/Purple
    return {
      bg: "bg-indigo-50/50",
      gradientRight: "bg-indigo-500/20",
      gradientLeft: "bg-purple-400/25",
      accent: "text-indigo-600",
      borderAccent: "border-indigo-500/30",
      button: "border-indigo-600 hover:bg-indigo-50 text-indigo-600"
    };
  }
};

export default function Dashboard() {
  // i18n
  const { lang, setLang, t, tSido, tSigungu, langs, langLabels } = useTranslation();

  // URL 파라미터로부터 초기 상태 복원
  const getUrlParam = (key: string, fallback: string) => {
    if (typeof window === "undefined") return fallback;
    return new URLSearchParams(window.location.search).get(key) ?? fallback;
  };

  // Profile state
  const [height, setHeight] = useState<string>(() => getUrlParam("h", "171"));
  const [weight, setWeight] = useState<string>(() => getUrlParam("w", "60"));
  const [age, setAge] = useState<string>(() => getUrlParam("age", "28"));           // [신설] 나이
  const [bodyFat, setBodyFat] = useState<string>(() => getUrlParam("bf", "22"));
  const [gender, setGender] = useState<string>(() => getUrlParam("g", "female"));
  const [environment, setEnvironment] = useState<"indoor" | "outdoor">(() => getUrlParam("env", "outdoor") as "indoor" | "outdoor");
  const [activityLevel, setActivityLevel] = useState<string>(() => getUrlParam("act", "walking")); // [신설] 활동 수준
  const [showQuickProfile, setShowQuickProfile] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"home" | "hourly" | "clothing" | "settings">("home");

  // Body fat guide state
  const [showBodyFatGuide, setShowBodyFatGuide] = useState<boolean>(false);
  const [guideGenderTab, setGuideGenderTab] = useState<string>("male");
  const [gpsLoading, setGpsLoading] = useState<boolean>(false);
  const [userLatitude, setUserLatitude] = useState<number>(37.5264); // 서울 영등포구 기본값
  const [userLongitude, setUserLongitude] = useState<number>(126.8962);

  // 전국 거점 위경도 매핑 테이블 (시도 + 시군구 조합)
  const LOCATION_COORDINATES: Record<string, { lat: number; lon: number }> = {
    "서울특별시_강남구": { lat: 37.5172, lon: 127.0473 },
    "서울특별시_서초구": { lat: 37.4836, lon: 127.0327 },
    "서울특별시_송파구": { lat: 37.5145, lon: 127.1059 },
    "서울특별시_마포구": { lat: 37.5638, lon: 126.9084 },
    "서울특별시_종로구": { lat: 37.5735, lon: 126.9790 },
    "서울특별시_영등포구": { lat: 37.5264, lon: 126.8962 },
    "경기도_수원시": { lat: 37.2636, lon: 127.0286 },
    "경기도_성남시": { lat: 37.4449, lon: 127.1389 },
    "부산광역시_해운대구": { lat: 35.1631, lon: 129.1636 },
    "인천광역시_중구": { lat: 37.4728, lon: 126.6238 },
    "대구광역시_중구": { lat: 35.8694, lon: 128.6062 },
    "광주광역시_동구": { lat: 35.1461, lon: 126.9231 },
    "대전광역시_중구": { lat: 36.3250, lon: 127.4208 },
    "울산광역시_남구": { lat: 35.5437, lon: 129.3300 },
    "세종특별자치시_세종시": { lat: 36.4800, lon: 127.2890 },
    "제주특별자치도_제주시": { lat: 33.5006, lon: 126.5312 },
  };

  // [신설] Supabase Auth & Guest 세션 상태
  const [userId, setUserId] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [authEmail, setAuthEmail] = useState<string>("");
  const [authPassword, setAuthPassword] = useState<string>("");
  const [isSignUp, setIsSignUp] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(false);

  // Region selection state
  const [regions, setRegions] = useState<RegionMap>({});
  const [selectedSido, setSelectedSido] = useState<string>("서울특별시");
  const [selectedSigungu, setSelectedSigungu] = useState<string>("강남구");

  // Map and weather state
  // 현재 시각 기준으로 전 2시간 ~ 후 2시간 총 5개 슬롯을 동적 생성
  const getCurrentHourStr = () => {
    const h = new Date().getHours();
    return `${String(h).padStart(2, "0")}:00`;
  };
  const buildTimeSlotsAroundNow = () => {
    const h = new Date().getHours();
    return Array.from({ length: 5 }, (_, i) => {
      const slot = (h - 2 + i + 24) % 24;
      return `${String(slot).padStart(2, "0")}:00`;
    });
  };
  const [selectedTime, setSelectedTime] = useState<string>(getCurrentHourStr);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState<boolean>(false);
  const [times] = useState<string[]>(buildTimeSlotsAroundNow);

  // Feedback toast state
  const [feedbackToast, setFeedbackToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  // API response and UI state
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [result, setResult] = useState<RecommendationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hourlyResults, setHourlyResults] = useState<Record<string, RecommendationData>>({});
  const [hourlyLoading, setHourlyLoading] = useState<boolean>(false);

  const theme = getThemeStyles(result?.pmv);

  // 실시간 기상 경보/특보 판단 헬퍼
  const getWeatherAlerts = (): { title: string; desc: string; type: "warning" | "danger" }[] => {
    if (!result || !result.weather) return [];
    const t = result.weather.temperature;
    const w = result.weather.wind_speed;
    const h = result.weather.humidity;
    const alerts = [];

    if (t >= 33) {
      alerts.push({
        title: "🥵 폭염 특보 (Extreme Heat)",
        desc: "실외 활동 시 일사병 위험이 높으니 충분히 수분을 섭취하세요.",
        type: "danger" as const
      });
    } else if (t <= -10) {
      alerts.push({
        title: "🥶 한파 특보 (Extreme Cold)",
        desc: "동상 및 저체온증 위험이 있으니 외출 시 방한 의류를 철저히 갖추세요.",
        type: "danger" as const
      });
    }

    if (w >= 10.0) {
      alerts.push({
        title: "🌬️ 강풍 주의보 (High Wind)",
        desc: "바람이 매우 강해 체온이 급격히 떨어질 수 있으니 야외 체류 시 방풍 아우터를 챙기세요.",
        type: "warning" as const
      });
    }

    if (h >= 90 && t >= 29) {
      alerts.push({
        title: "💦 고온다습 불쾌경보",
        desc: "습도가 90% 이상으로 열 배출이 어렵습니다. 격렬한 신체 활동을 자제하세요.",
        type: "warning" as const
      });
    }

    return alerts;
  };

  // UTCI 기반 야외 활동별 적합도 산출 헬퍼
  const getActivitySuitability = (utciVal: number) => {
    // 5단계 등급 정의: 아주 좋음(Excellent), 좋음(Good), 보통(Moderate), 주의(Caution), 위험(Avoid)
    const getLevel = (score: number) => {
      if (score >= 90) return { label: "아주 좋음", color: "text-emerald-600 bg-emerald-50 border-emerald-100", barColor: "bg-emerald-500" };
      if (score >= 75) return { label: "좋음", color: "text-blue-600 bg-blue-50 border-blue-100", barColor: "bg-blue-500" };
      if (score >= 50) return { label: "보통", color: "text-amber-600 bg-amber-50 border-amber-100", barColor: "bg-amber-500" };
      if (score >= 30) return { label: "주의", color: "text-orange-600 bg-orange-50 border-orange-100", barColor: "bg-orange-500" };
      return { label: "위험", color: "text-rose-600 bg-rose-50 border-rose-100", barColor: "bg-rose-500" };
    };

    let runScore = 95;
    let cycleScore = 95;
    let walkScore = 95;

    // UTCI 스트레스 지수에 따른 감점 설계
    if (utciVal >= 38) { // 극심한 열 스트레스
      runScore = 15; cycleScore = 20; walkScore = 30;
    } else if (utciVal >= 32) { // 강한 열 스트레스
      runScore = 40; cycleScore = 45; walkScore = 60;
    } else if (utciVal >= 26) { // 중등도 열 스트레스
      runScore = 70; cycleScore = 75; walkScore = 80;
    } else if (utciVal < 9 && utciVal >= 0) { // 가벼운 추위 스트레스
      runScore = 85; cycleScore = 80; walkScore = 75;
    } else if (utciVal < 0 && utciVal >= -13) { // 중등도 추위 스트레스
      runScore = 60; cycleScore = 50; walkScore = 55;
    } else if (utciVal < -13) { // 강한 추위 스트레스
      runScore = 20; cycleScore = 15; walkScore = 25;
    }

    return [
      { name: "🏃 러닝", score: runScore, ...getLevel(runScore) },
      { name: "🚴 라이딩", score: cycleScore, ...getLevel(cycleScore) },
      { name: "🚶 산책", score: walkScore, ...getLevel(walkScore) }
    ];
  };

  // 0. 사용자 세션 초기화 (Guest & Auth 결합)
  useEffect(() => {
    // 1) 현재 로그인된 정식 세션 체크
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && session.user) {
        setUserId(session.user.id);
        setUserEmail(session.user.email ?? null);
      } else {
        // 비로그인 시 LocalStorage 게스트 세션 로드/발급
        let guestId = localStorage.getItem("guest_user_id");
        if (!guestId) {
          guestId = "guest_" + Math.random().toString(36).substring(2, 11) + "_" + Date.now();
          localStorage.setItem("guest_user_id", guestId);
        }
        setUserId(guestId);
        setUserEmail(null);
      }
    });

    // 2) Auth 상태 변동 리스너 등록
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && session.user) {
        setUserId(session.user.id);
        setUserEmail(session.user.email ?? null);
      } else {
        let guestId = localStorage.getItem("guest_user_id");
        if (!guestId) {
          guestId = "guest_" + Math.random().toString(36).substring(2, 11) + "_" + Date.now();
          localStorage.setItem("guest_user_id", guestId);
        }
        setUserId(guestId);
        setUserEmail(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // ① 지역 목록 초기 로드
  useEffect(() => {
    fetch("http://localhost:8002/api/v1/regions")
      .then((r) => r.json())
      .then((data) => {
        setRegions(data.regions || {});
      })
      .catch(() => {
        // fallback: 백엔드 연결 실패 시 기본값 사용
        setRegions({ "서울특별시": ["강남구", "마포구", "서초구", "송파구", "종로구"] });
      });
  }, []);

  // ② 시도 변경 시 시군구 첫 번째 값으로 자동 설정
  useEffect(() => {
    if (regions[selectedSido] && regions[selectedSido].length > 0) {
      const firstSigungu = regions[selectedSido][0];
      setSelectedSigungu(firstSigungu);
      
      const lookupKey = `${selectedSido}_${firstSigungu}`;
      const coords = LOCATION_COORDINATES[lookupKey];
      if (coords) {
        setUserLatitude(coords.lat);
        setUserLongitude(coords.lon);
      }
    }
  }, [selectedSido, regions]);

  // 시군구 변경 시 좌표 업데이트
  useEffect(() => {
    const lookupKey = `${selectedSido}_${selectedSigungu}`;
    const coords = LOCATION_COORDINATES[lookupKey];
    if (coords) {
      setUserLatitude(coords.lat);
      setUserLongitude(coords.lon);
    }
  }, [selectedSigungu]);

  // ③ 페이지 첫 진입 및 사용자 로그인 전환 시 자동 분석 실행
  useEffect(() => {
    if (Object.keys(regions).length > 0 && userId) {
      handleAnalyzeAllHours();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regions, userId]);

  // ④ 신체 스펙 및 파라미터 변경 시 디바운스 분석 실행 (실시간 반응감 극대화)
  // * selectedTime은 의도적으로 제외하여, 시간대 스위칭 시 불필요한 네트워크 fetch를 차단함
  useEffect(() => {
    if (Object.keys(regions).length === 0 || !userId) return;
    const delayDebounce = setTimeout(() => {
      handleAnalyzeAllHours();
    }, 350);
    return () => clearTimeout(delayDebounce);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height, weight, age, bodyFat, gender, environment, activityLevel, selectedSido, selectedSigungu]);

  // ⑤ 시간대 변경 시 로컬에서 즉시 맵핑하여 지연 시간(0ms) 제거
  useEffect(() => {
    if (hourlyResults[selectedTime]) {
      setResult(hourlyResults[selectedTime]);
    }
  }, [selectedTime, hourlyResults]);

  const handleAnalyzeAllHours = async (
    overrides?: { sido?: string; sigungu?: string; gender?: string; environment?: string; bodyFat?: string }
  ) => {
    if (!userId) return;
    setIsLoading(true);
    setHourlyLoading(true);
    setError(null);
    try {
      const sido = overrides?.sido ?? selectedSido;
      const sigungu = overrides?.sigungu ?? selectedSigungu;
      const genderVal = overrides?.gender ?? gender;
      const envVal = overrides?.environment ?? environment;
      const bodyFatVal = overrides?.bodyFat ?? bodyFat;

      // 5개 예보 시간대 전체를 병렬 비동기 호출
      // 현재 sido, sigungu를 통해 로컬에서 구한 대표 좌표값 확인
      const lookupKey = `${sido}_${sigungu}`;
      const defaultCoords = LOCATION_COORDINATES[lookupKey] || { lat: 37.5264, lon: 126.8962 };
      
      // GPS가 켜져서 해당 지역이 선택되어 있으면 상태 위경도를 쓰고, 아니면 거점 위경도를 활용
      const targetLat = (sido === selectedSido && sigungu === selectedSigungu) ? userLatitude : defaultCoords.lat;
      const targetLon = (sido === selectedSido && sigungu === selectedSigungu) ? userLongitude : defaultCoords.lon;

      const promises = times.map(async (timeStr) => {
        const parsedHour = parseInt(timeStr.split(":")[0]);
        const response = await fetch("http://localhost:8002/api/v1/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile: {
              user_id: userId,
              height: parseFloat(height) || 171,
              weight: parseFloat(weight) || 60,
              age: parseInt(age) || 28,
              body_fat: bodyFatVal ? parseFloat(bodyFatVal) : null,
              gender: genderVal,
              environment: envVal,
              activity_level: activityLevel,
            },
            latitude: targetLat,
            longitude: targetLon,
            sido,
            sigungu,
            selected_hour: parsedHour,
            lang,
          }),
        });

        if (!response.ok) throw new Error(`${timeStr} 예보 조회를 실패했습니다.`);
        const data = await response.json();
        return {
          time: timeStr,
          data: {
            utci: data.utci,
            utci_personalized: data.utci_personalized,
            utci_category: data.utci_category,
            pmv: data.pmv ?? data.utci_personalized,
            thermal_sensation: data.thermal_sensation,
            recommendations: data.recommendations,
            weather: data.weather,
            body_params: data.body_params,
          } as RecommendationData,
        };
      });

      const resultsList = await Promise.all(promises);
      const resultsMap: Record<string, RecommendationData> = {};
      resultsList.forEach((item) => {
        resultsMap[item.time] = item.data;
      });

      setHourlyResults(resultsMap);

      // 현재 선택되어 있는 시간대의 결과 매칭
      const currentResult = resultsMap[selectedTime];
      if (currentResult) {
        setResult(currentResult);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "서버 통신 실패");
    } finally {
      setIsLoading(false);
      setHourlyLoading(false);
    }
  };

  const handleQuickFillBodyFat = (value: string) => {
    setBodyFat(value);
    setShowBodyFatGuide(false);
    handleAnalyzeAllHours({ bodyFat: value });
  };

  const handleGPSLocation = () => {
    if (!navigator.geolocation) {
      alert("GPS 위치 정보 서비스를 지원하지 않는 브라우저입니다.");
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`,
            {
              headers: {
                "Accept-Language": "ko-KR,ko;q=0.9"
              }
            }
          );
          if (!response.ok) throw new Error("역지오코딩 서비스 응답 실패");
          const data = await response.json();
          if (data && data.address) {
            const address = data.address;
            const rawSido = address.province || address.city || address.state || "";
            const rawSigungu = address.borough || address.suburb || address.city_district || address.district || address.county || "";
            
            const matchSido = Object.keys(regions).find(s => 
              s.includes(rawSido) || rawSido.includes(s)
            );
            
            if (matchSido) {
              const sigungus = regions[matchSido] || [];
              const matchSigungu = sigungus.find(g => 
                g.includes(rawSigungu) || rawSigungu.includes(g)
              );
              
              if (matchSigungu) {
                setSelectedSido(matchSido);
                setSelectedSigungu(matchSigungu);
                setUserLatitude(lat);
                setUserLongitude(lon);
                // 강제로 lat, lon 상태를 API 파라미터로 넘겨 분석
                handleAnalyzeAllHours({ sido: matchSido, sigungu: matchSigungu });
                alert(`현재 위치가 [${matchSido} ${matchSigungu}]로 설정되었습니다. (좌표: ${lat.toFixed(4)}, ${lon.toFixed(4)})`);
              } else {
                setSelectedSido(matchSido);
                const fallbackGu = sigungus[0] || "";
                setSelectedSigungu(fallbackGu);
                setUserLatitude(lat);
                setUserLongitude(lon);
                handleAnalyzeAllHours({ sido: matchSido, sigungu: fallbackGu });
                alert(`현재 위치 시도 [${matchSido}]가 설정되었으나 상세 구[${rawSigungu}] 매칭이 제한되어 근사 구[${fallbackGu}]로 매핑되었습니다. (좌표: ${lat.toFixed(4)}, ${lon.toFixed(4)})`);
              }
            } else {
              alert(`식별된 위치 [${rawSido} ${rawSigungu}]가 서비스 범위 외 지역이거나 지원되지 않습니다.`);
            }
          } else {
            alert("현재 위치의 주소 분석에 실패했습니다.");
          }
        } catch (err) {
          console.error("GPS Geocoding error:", err);
          alert("네트워크 통신 중 주소 분석 오류가 발생했습니다.");
        } finally {
          setGpsLoading(false);
        }
      },
      (error) => {
        console.error("GPS position error:", error);
        let errorMsg = "위치 정보를 가져오지 못했습니다.";
        if (error.code === error.PERMISSION_DENIED) {
          errorMsg = "위치 정보 허용 권한이 거부되었습니다. 브라우저 권한 설정을 확인하세요.";
        }
        alert(errorMsg);
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const getSummarySentence = () => {
    if (!result) return "";
    const genderText = gender === "male" 
      ? (lang === "ko" ? "남성" : lang === "en" ? "Male" : "男性")
      : (lang === "ko" ? "여성" : lang === "en" ? "Female" : "女性");
    const envText = environment === "outdoor"
      ? (lang === "ko" ? "실외 자연풍" : lang === "en" ? "Outdoor natural wind" : "屋外自然風")
      : (lang === "ko" ? "실내 공조(HVAC) 차단" : lang === "en" ? "Indoor HVAC active" : "室内空調（HVAC）");
    const bodyFatText = bodyFat 
      ? (lang === "ko" ? `체지방률 ${bodyFat}%` : lang === "en" ? `Body fat ${bodyFat}%` : `体脂肪率 ${bodyFat}%`)
      : (lang === "ko" ? "평균 체지방" : lang === "en" ? "Average body fat" : "平均体脂肪");
      
    const pmvVal = result.pmv;
    let sensationDesc = "";
    
    if (lang === "ko") {
      if (pmvVal >= 2.5) sensationDesc = "매우 더운 극한 열 스트레스 (+3)";
      else if (pmvVal >= 1.5) sensationDesc = "더운 주의 수준의 열 부하 (+2)";
      else if (pmvVal >= 0.5) sensationDesc = "약간 더운 온열감 (+1)";
      else if (pmvVal > -0.5) sensationDesc = "열적으로 쾌적하고 안정된 감각 (0)";
      else if (pmvVal > -1.5) sensationDesc = "약간 추운 선선한 상태 (-1)";
      else if (pmvVal > -2.5) sensationDesc = "추운 냉기 부하 (-2)";
      else sensationDesc = "매우 추운 극한 한랭 스트레스 (-3)";
    } else if (lang === "en") {
      if (pmvVal >= 2.5) sensationDesc = "Very Hot (Extreme Heat Stress, +3)";
      else if (pmvVal >= 1.5) sensationDesc = "Warm (Heat Load Alert, +2)";
      else if (pmvVal >= 0.5) sensationDesc = "Slightly Warm (+1)";
      else if (pmvVal > -0.5) sensationDesc = "Thermally Comfortable & Stable (0)";
      else if (pmvVal > -1.5) sensationDesc = "Slightly Cool (-1)";
      else if (pmvVal > -2.5) sensationDesc = "Cool/Cold Sensation (-2)";
      else sensationDesc = "Very Cold (Extreme Cold Stress, -3)";
    } else {
      if (pmvVal >= 2.5) sensationDesc = "非常に暑い 極度の熱ストレス (+3)";
      else if (pmvVal >= 1.5) sensationDesc = "暑い 注意レベルの熱負荷 (+2)";
      else if (pmvVal >= 0.5) sensationDesc = "やや暑い 温熱感 (+1)";
      else if (pmvVal > -0.5) sensationDesc = "熱的に快適で安定した感覚 (0)";
      else if (pmvVal > -1.5) sensationDesc = "やや涼しい 涼感状態 (-1)";
      else if (pmvVal > -2.5) sensationDesc = "涼しい / 寒い 冷気負荷 (-2)";
      else sensationDesc = "非常に寒い 極度の冷気ストレス (-3)";
    }

    if (lang === "ko") {
      return `현재 ${selectedSido} ${selectedSigungu}의 날씨(기온 ${result.weather?.temperature.toFixed(1)}°C, 습도 ${result.weather?.humidity}%, 풍속 ${result.weather?.wind_speed.toFixed(1)}m/s)와 사용자님의 신체 스펙(신장 ${height}cm, 체중 ${weight}kg, ${genderText}, ${bodyFatText}) 및 ${envText} 환경 조건이 결합되었습니다. 이에 따라 계산된 체감 PMV 지수는 ${pmvVal > 0 ? `+${pmvVal}` : pmvVal}로, '${sensationDesc}' 상태를 보이고 있습니다.`;
    } else if (lang === "en") {
      return `Current weather in ${tSido(selectedSido)} ${tSigungu(selectedSigungu)} (Temp ${result.weather?.temperature.toFixed(1)}°C, Humidity ${result.weather?.humidity}%, Wind ${result.weather?.wind_speed.toFixed(1)}m/s) combined with your body specifications (Height ${height}cm, Weight ${weight}kg, ${genderText}, ${bodyFatText}) and ${envText} environment conditions. The calculated PMV is ${pmvVal > 0 ? `+${pmvVal}` : pmvVal}, showing a status of '${sensationDesc}'.`;
    } else {
      return `現在の${tSido(selectedSido)} ${tSigungu(selectedSigungu)}の天気（気温 ${result.weather?.temperature.toFixed(1)}°C、湿度 ${result.weather?.humidity}%、風速 ${result.weather?.wind_speed.toFixed(1)}m/s）と、ユーザー様の体型スペック（身長 ${height}cm、体重 ${weight}kg、${genderText}、${bodyFatText}）および${envText}環境条件が結合されました。これに基づき計算されたPMV指数は ${pmvVal > 0 ? `+${pmvVal}` : pmvVal} で、現在「${sensationDesc}」状態を示しています。`;
    }
  };

  // PMV 기반 유사 신체 스펙 추천 카드 동적 데이터 (7단계 척도 다국어)
  const getSimilarUserRecommendations = () => {
    if (!result) return null;
    const pmv = result.pmv;
    
    const RECS = {
      "ko": {
        "p3": {
          clothing: { icon: "👕", label: "냉감 기능성 웨어", badge: "93% 극열기 선택", color: "red" },
          hydration: { icon: "💧", label: "이온 전해질 음료", badge: "88% 보충 권장", color: "blue" },
          activity: { icon: "⚠️", label: "격렬한 실외 자제", badge: "97% 실내 권장", color: "orange", chevron: true }
        },
        "p2": {
          clothing: { icon: "👕", label: "린넨 반팔 아웃핏", badge: "81% 선호도 득표", color: "blue" },
          hydration: { icon: "💧", label: "이온 수분 음료", badge: "75% 섭취 선택", color: "blue" },
          activity: { icon: "⚠️", label: "그늘 야외활동 중심", badge: "92% 선호 비율", color: "orange", chevron: true }
        },
        "p1": {
          clothing: { icon: "👕", label: "시원한 반팔 면티", badge: "86% 쾌적 선택", color: "green" },
          hydration: { icon: "💧", label: "아이스 아메리카노 / 물", badge: "72% 수분 섭취", color: "blue" },
          activity: { icon: "🏃", label: "통풍이 잘되는 야외활동", badge: "88% 권장 비율", color: "green", chevron: false }
        },
        "zero": {
          clothing: { icon: "👕", label: "일반 캐주얼 면티셔츠", badge: "89% 쾌적 선택", color: "green" },
          hydration: { icon: "💧", label: "상온의 물 / 가벼운 탄산수", badge: "70% 일반 수분", color: "blue" },
          activity: { icon: "🏃", label: "가벼운 피크닉 / 실외 산책", badge: "94% 완벽 등급", color: "green", chevron: false }
        },
        "m1": {
          clothing: { icon: "🧥", label: "레이어드 카디건 / 얇은 셔츠", badge: "78% 레이어링", color: "blue" },
          hydration: { icon: "☕", label: "미지근한 보리차 / 따뜻한 물", badge: "65% 온수 섭취", color: "orange" },
          activity: { icon: "🏃", label: "활동적인 움직임 권장", badge: "80% 체온 관리", color: "blue", chevron: false }
        },
        "m2": {
          clothing: { icon: "🧥", label: "두툼한 가디건 / 윈드브레이커", badge: "82% 체온 보호", color: "blue" },
          hydration: { icon: "☕", label: "따뜻한 음차 / 허브 티", badge: "71% 온차 섭취", color: "orange" },
          activity: { icon: "🏃", label: "체온 유지용 스트레칭", badge: "85% 가벼운 활동", color: "blue", chevron: false }
        },
        "m3": {
          clothing: { icon: "🧥", label: "도톰한 점퍼 / 스웨터", badge: "91% 보온 무장", color: "red" },
          hydration: { icon: "☕", label: "따뜻한 꿀물 / 생강차", badge: "80% 체온 보온", color: "orange" },
          activity: { icon: "⚠️", label: "장시간 외부 대기 금지", badge: "95% 실내 피신", color: "orange", chevron: true }
        }
      },
      "en": {
        "p3": {
          clothing: { icon: "👕", label: "Cooling Techwear", badge: "93% Heat choice", color: "red" },
          hydration: { icon: "💧", label: "Electrolyte Drinks", badge: "88% High intake", color: "blue" },
          activity: { icon: "⚠️", label: "Avoid Outdoor Action", badge: "97% Indoor rec", color: "orange", chevron: true }
        },
        "p2": {
          clothing: { icon: "👕", label: "Linen Short Sleeves", badge: "81% Top preference", color: "blue" },
          hydration: { icon: "💧", label: "Hydration Drinks", badge: "75% Fluid choice", color: "blue" },
          activity: { icon: "⚠️", label: "Shaded Outdoor Activity", badge: "92% Shaded rec", color: "orange", chevron: true }
        },
        "p1": {
          clothing: { icon: "👕", label: "Cool Short Cotton Tee", badge: "86% Comfort choice", color: "green" },
          hydration: { icon: "💧", label: "Iced Coffee / Water", badge: "72% Fluid intake", color: "blue" },
          activity: { icon: "🏃", label: "Well-ventilated Activity", badge: "88% High rec", color: "green", chevron: false }
        },
        "zero": {
          clothing: { icon: "👕", label: "Casual Cotton Tee", badge: "89% Comfort choice", color: "green" },
          hydration: { icon: "💧", label: "Lukewarm Water", badge: "70% Fluid intake", color: "blue" },
          activity: { icon: "🏃", label: "Light Picnic / Walks", badge: "94% Perfect index", color: "green", chevron: false }
        },
        "m1": {
          clothing: { icon: "🧥", label: "Layered Cardigan", badge: "78% Layer choice", color: "blue" },
          hydration: { icon: "☕", label: "Warm Barley Tea / Water", badge: "65% Warm fluid", color: "orange" },
          activity: { icon: "🏃", label: "Active Movement", badge: "80% Temp control", color: "blue", chevron: false }
        },
        "m2": {
          clothing: { icon: "🧥", label: "Thick Cardigan / Jacket", badge: "82% Temp protection", color: "blue" },
          hydration: { icon: "☕", label: "Warm Tea / Herbal Infusion", badge: "71% Warm choice", color: "orange" },
          activity: { icon: "🏃", label: "Light Active Stretches", badge: "85% Safe activity", color: "blue", chevron: false }
        },
        "m3": {
          clothing: { icon: "🧥", label: "Thick Puffer / Sweater", badge: "91% Heavy layering", color: "red" },
          hydration: { icon: "☕", label: "Warm Honey / Ginger Tea", badge: "80% Energy recovery", color: "orange" },
          activity: { icon: "⚠️", label: "No Long Outdoor Exposure", badge: "95% Stay indoor", color: "orange", chevron: true }
        }
      },
      "ja": {
        "p3": {
          clothing: { icon: "👕", label: "冷感機能性ウェア", badge: "93% 極熱期選択", color: "red" },
          hydration: { icon: "💧", label: "電解質補給飲料", badge: "88% 補給推奨", color: "blue" },
          activity: { icon: "⚠️", label: "激しい屋外活動中止", badge: "97% 室内避難", color: "orange", chevron: true }
        },
        "p2": {
          clothing: { icon: "👕", label: "リネン半袖シャツ", badge: "81% 好感度投票", color: "blue" },
          hydration: { icon: "💧", label: "水分補給飲料", badge: "75% 水分補給", color: "blue" },
          activity: { icon: "⚠️", label: "日陰の屋外活動中心", badge: "92% 日陰推奨", color: "orange", chevron: true }
        },
        "p1": {
          clothing: { icon: "👕", label: "涼しい半袖Tシャツ", badge: "86% 快適選択", color: "green" },
          hydration: { icon: "💧", label: "アイスコーヒー / 水", badge: "72% 水分摂取", color: "blue" },
          activity: { icon: "🏃", label: "通風の良い屋外活動", badge: "88% 推奨割合", color: "green", chevron: false }
        },
        "zero": {
          clothing: { icon: "👕", label: "快適なカジュアルTシャツ", badge: "89% 快適選択", color: "green" },
          hydration: { icon: "💧", label: "常温水 / 炭酸水", badge: "70% 一般水分", color: "blue" },
          activity: { icon: "🏃", label: "軽いピクニック / 散歩", badge: "94% 完璧指数", color: "green", chevron: false }
        },
        "m1": {
          clothing: { icon: "🧥", label: "薄手カーディガン / 長袖", badge: "78% 重ね着推奨", color: "blue" },
          hydration: { icon: "☕", label: "麦茶 / 温かい水", badge: "65% 温水摂取", color: "orange" },
          activity: { icon: "🏃", label: "活発な身体活動推奨", badge: "80% 体温管理", color: "blue", chevron: false }
        },
        "m2": {
          clothing: { icon: "🧥", label: "厚手カーディガン / 長袖", badge: "82% 体温保護", color: "blue" },
          hydration: { icon: "☕", label: "温かいお茶 / ハーブティー", badge: "71% 温茶摂取", color: "orange" },
          activity: { icon: "🏃", label: "体温維持ストレッチ", badge: "85% 軽い活動", color: "blue", chevron: false }
        },
        "m3": {
          clothing: { icon: "🧥", label: "厚手ジャンパー / セーター", badge: "91% 防寒完全武装", color: "red" },
          hydration: { icon: "☕", label: "温かいハチミツ水 / 生姜茶", badge: "80% エネルギー補正", color: "orange" },
          activity: { icon: "⚠️", label: "長時間の屋外滞在禁止", badge: "95% 室内避難推奨", color: "orange", chevron: true }
        }
      }
    };

    const langRecs = RECS[lang] ?? RECS["ko"];
    
    if (pmv >= 2.5) return langRecs["p3"];
    if (pmv >= 1.5) return langRecs["p2"];
    if (pmv >= 0.5) return langRecs["p1"];
    if (pmv > -0.5) return langRecs["zero"];
    if (pmv > -1.5) return langRecs["m1"];
    if (pmv > -2.5) return langRecs["m2"];
    return langRecs["m3"];
  };


  const handleFeedback = async (feedbackType: "too_hot" | "too_cold" | "good") => {
    if (!result || !userId) return;
    try {
      const response = await fetch("http://localhost:8002/api/v1/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId, // [변경] 동적 유저 ID 바인딩
          feedback_type: feedbackType,
          pmv_calculated: result.pmv,
          temperature: result.weather?.temperature ?? 25.0,
          clo_applied: result.recommendations.clo_applied ?? 0.5
        })
      });
      if (response.ok) {
        setFeedbackToast({ msg: "피드백이 반영되었습니다. 추천을 다시 업데이트합니다.", type: "success" });
        setTimeout(() => setFeedbackToast(null), 3000);
        // 피드백 반영 후 대시보드 상태 즉시 재분석
        await handleAnalyzeAllHours();
      } else {
        setFeedbackToast({ msg: "피드백 전송에 실패했습니다. 잠시 후 다시 시도하세요.", type: "error" });
        setTimeout(() => setFeedbackToast(null), 3000);
        console.error("Failed to submit feedback");
      }
    } catch (e) {
      setFeedbackToast({ msg: "네트워크 오류가 발생했습니다.", type: "error" });
      setTimeout(() => setFeedbackToast(null), 3000);
      console.error("Feedback submit error", e);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword
      });
      if (error) throw error;
      setShowAuthModal(false);
      setAuthEmail("");
      setAuthPassword("");
    } catch (err: any) {
      setAuthError(err.message || "로그인에 실패했습니다.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    try {
      const { error } = await supabase.auth.signUp({
        email: authEmail,
        password: authPassword
      });
      if (error) throw error;
      setShowAuthModal(false);
      setAuthEmail("");
      setAuthPassword("");
      alert("회원가입 메일이 전송되었거나 가입이 완료되었습니다!");
    } catch (err: any) {
      setAuthError(err.message || "회원가입에 실패했습니다.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    alert("로그아웃 되었습니다. 게스트 세션으로 복원됩니다.");
  };

  const handleReset = () => {
    const defaults = {
      height: "181", weight: "78", bodyFat: "16",
      gender: "male", environment: "outdoor" as const,
      sido: "서울특별시", sigungu: "강남구",
    };
    setHeight(defaults.height);
    setWeight(defaults.weight);
    setBodyFat(defaults.bodyFat);
    setGender(defaults.gender);
    setEnvironment(defaults.environment);
    setSelectedSido(defaults.sido);
    setSelectedSigungu(defaults.sigungu);
    handleAnalyzeAllHours({ 
      sido: defaults.sido, 
      sigungu: defaults.sigungu, 
      gender: defaults.gender, 
      environment: defaults.environment,
      bodyFat: defaults.bodyFat 
    });
  };

  // PMV (-3 to +3) → 바늘 회전 각도 (-90 to +90)
  const getNeedleRotation = (pmv: number) => {
    const clamped = Math.max(-3, Math.min(3, pmv));
    return (clamped / 3) * 90;
  };

  // 공유 URL 생성
  const generateShareUrl = useCallback(() => {
    const params = new URLSearchParams({
      sido: selectedSido,
      sigungu: selectedSigungu,
      h: height,
      w: weight,
      bf: bodyFat,
      g: gender,
      env: environment,
      t: selectedTime,
      lang,
    });
    return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  }, [selectedSido, selectedSigungu, height, weight, bodyFat, gender, environment, selectedTime, lang]);

  // 링크 복사
  const copyShareLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(generateShareUrl());
      setFeedbackToast({ msg: t("share.copied"), type: "success" });
      setTimeout(() => setFeedbackToast(null), 3000);
    } catch {
      setFeedbackToast({ msg: t("share.copy_fail"), type: "error" });
      setTimeout(() => setFeedbackToast(null), 3000);
    }
  }, [generateShareUrl, t]);

  // 결과 카드 이미지 저장 (네이티브 Print API)
  const saveShareImage = useCallback(() => {
    window.print();
  }, []);

  const sidoList = Object.keys(regions);
  const sigunguList = regions[selectedSido] ?? [];

  return (
    <>
      <div className={`relative min-h-screen ${theme.bg} text-slate-800 flex justify-center font-sans antialiased transition-colors duration-500 pb-10`}>
      {/* Background Decorative Gradients */}
      <div className={`absolute top-[20%] right-[10%] w-[400px] h-[400px] rounded-full ${theme.gradientRight} blur-[120px] pointer-events-none transition-colors duration-500`} />
      <div className={`absolute bottom-[10%] left-[10%] w-[400px] h-[400px] rounded-full ${theme.gradientLeft} blur-[120px] pointer-events-none transition-colors duration-500`} />

      {/* Mobile Device Frame Container */}
      <div className="max-w-[480px] w-full bg-white/70 backdrop-blur-xl shadow-2xl flex flex-col min-h-screen sm:min-h-[850px] sm:my-8 sm:rounded-[36px] overflow-hidden border border-white/60 relative animate-in fade-in duration-300">
        
        {/* Header */}
        <header className="bg-slate-900 border-b border-slate-950 text-white sticky top-0 z-20 px-5 py-3 shadow-md flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <Thermometer className="w-4 h-4" />
            </div>
            <h1 className="text-xs font-black tracking-tight text-white">
              THERMAL GUIDE <span className="text-blue-400 text-[10px] font-semibold">v2.0</span>
            </h1>
          </div>
          
          <div className="flex items-center gap-3">
            {/* 언어 토글 칩 */}
            <div className="flex bg-slate-850 border border-slate-700 rounded-lg p-0.5">
              {langs.map((l) => (
                <button
                  key={l}
                  onClick={() => { setLang(l); handleAnalyzeAllHours(); }}
                  className={`px-1.5 py-0.5 rounded text-[8px] font-black transition-all ${
                    lang === l ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>

            {/* 로그인 / 프로필 */}
            {userEmail ? (
              <button 
                onClick={handleSignOut}
                className="text-[9px] bg-slate-800 hover:bg-slate-700 text-slate-300 font-extrabold py-1 px-2 rounded-lg border border-slate-700"
              >
                {t("header.logout")}
              </button>
            ) : (
              <button 
                onClick={() => { setShowAuthModal(true); setAuthError(null); }}
                className="text-[9px] bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-1 px-2 rounded-lg border border-blue-500 shadow-sm"
              >
                {t("header.login_short") || "로그인"}
              </button>
            )}
          </div>
        </header>

        {/* Tab Contents Area (Scrollable) */}
        <div className="flex-1 overflow-y-auto pb-20 relative">

          {/* 1. 홈 탭 (Home View) */}
          {activeTab === "home" && (
            <div className="animate-in fade-in duration-200 flex flex-col items-center">
              <section className="flex flex-col items-center w-full px-6 pt-5 pb-2 shrink-0 relative">
          
          {/* 위치 정보 & GPS 자동 매핑 (모달 연동 및 마우스 커서/디자인 개선) */}
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => setIsLocationModalOpen(true)}
              className="px-3 py-1 rounded-full bg-slate-100 hover:bg-blue-50 text-slate-800 hover:text-blue-600 text-xs font-black flex items-center gap-1.5 transition-all duration-200 border border-slate-200/40 shadow-sm"
              title="클릭하여 수동 위치 설정 및 지도 보기"
            >
              <Map className="w-3.5 h-3.5 text-blue-500" />
              {selectedSido} {selectedSigungu}
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>
            <button
              onClick={handleGPSLocation}
              disabled={gpsLoading}
              className="p-1.5 rounded-full bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 transition-all duration-200 disabled:opacity-50 shadow-sm"
              title="GPS 현재 위치 자동 매핑"
            >
              {gpsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <MapPin className="w-3 h-3" />}
            </button>
          </div>

          {/* 실시간 날씨 데이터 요약 */}
          {result && result.weather && (
            <div className="flex items-center gap-2 mb-4 bg-white/40 border border-white/50 px-3 py-1 rounded-full shadow-sm text-[10px] font-bold text-slate-600">
              <span className="flex items-center gap-0.5 text-red-500">
                <Thermometer className="w-3 h-3" />
                {result.weather.temperature.toFixed(1)}°C
              </span>
              <span className="text-slate-300">|</span>
              <span className="flex items-center gap-0.5 text-blue-500">
                <Droplet className="w-3 h-3" />
                {result.weather.humidity}%
              </span>
              <span className="text-slate-300">|</span>
              <span className="flex items-center gap-0.5 text-teal-600">
                <Wind className="w-3 h-3" />
                {result.weather.wind_speed.toFixed(1)}m/s
              </span>
            </div>
          )}

          {/* 실시간 기상 재해/특보 알림 배너 (깜빡임 애니메이션 추가) */}
          {(() => {
            const alerts = getWeatherAlerts();
            if (alerts.length === 0) return null;
            return (
              <div className="w-full flex flex-col gap-1.5 mb-4 max-w-sm">
                {alerts.map((alert, idx) => (
                  <div 
                    key={idx} 
                    className={`px-3 py-2 rounded-2xl border text-[10px] leading-relaxed font-bold shadow-sm animate-pulse ${
                      alert.type === "danger" 
                        ? "bg-rose-50 border-rose-200 text-rose-700" 
                        : "bg-amber-50 border-amber-200 text-amber-700"
                    }`}
                  >
                    <div className="flex items-center gap-1 font-black mb-0.5">{alert.title}</div>
                    <div>{alert.desc}</div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* 체감 지수 배지 (UTCI 기반) */}
          {result && (
            <div className={`px-4 py-1.5 rounded-full text-xs font-black shadow-sm flex items-center gap-1.5 z-10 transition-colors ${
              (result.utci_personalized ?? result.pmv) >= 32
                ? "bg-rose-100 text-rose-700 border border-rose-200"
                : (result.utci_personalized ?? result.pmv) <= 0
                  ? "bg-sky-100 text-sky-700 border border-sky-200"
                  : "bg-emerald-100 text-emerald-700 border border-emerald-200"
            }`}>
              {(result.utci_personalized ?? result.pmv) >= 32 && <AlertTriangle className="w-3.5 h-3.5" />}
              <span>{result.thermal_sensation}</span>
              {result.utci_personalized !== undefined && (
                <span className="ml-1 opacity-70 text-[9px]">UTCI {result.utci_personalized.toFixed(1)}°C</span>
              )}
            </div>
          )}

          {/* 개인화 안전 넛지 배너 */}
          {result && result.nudge && (
            <div className={`w-full max-w-[340px] p-5 my-4 rounded-3xl border transition-all duration-300 backdrop-blur-xl shadow-xl z-10 flex flex-col gap-3.5 ${
              result.nudge.nudge_warning 
                ? "bg-rose-500/10 border-rose-500/35 text-rose-200" 
                : "bg-emerald-500/10 border-emerald-500/30 text-emerald-200"
            }`}>
              <div className="flex items-center gap-2.5 font-black text-xs uppercase tracking-wider">
                {result.nudge.nudge_warning ? (
                  <AlertTriangle className="w-5 h-5 text-rose-400 animate-pulse" />
                ) : (
                  <Sparkles className="w-5 h-5 text-emerald-400" />
                )}
                <span>{result.nudge.nudge_warning ? "개인화 온열 피로 경고" : "체감 정보 알림"}</span>
              </div>
              <p className="text-xs font-bold leading-relaxed text-slate-100/90 whitespace-pre-line">
                {result.nudge.nudge_message || "현재 안전한 상태입니다. 편안한 일상 활동을 즐기세요."}
              </p>
              {result.nudge.diff_temp !== 0 && (
                <div className="border-t border-white/10 pt-2 flex justify-between items-center text-[10px] font-bold text-slate-300">
                  <span>지역 체감 온도: {result.utci ? result.utci.toFixed(1) : result.pmv.toFixed(1)}°C</span>
                  <span className={result.nudge.diff_temp > 0 ? "text-rose-300" : "text-sky-300"}>
                    개인 격차: {result.nudge.diff_temp > 0 ? `+${result.nudge.diff_temp}` : result.nudge.diff_temp}°C
                  </span>
                </div>
              )}
            </div>
          )}

          {/* 3버튼 피드백 컨트롤 루프 */}
          {result && (
            <div className="w-full flex flex-col items-center gap-2 mt-1">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{t("thermal.feedback_q")}</span>
              <div className="flex gap-2 w-full max-w-[280px]">
                <button
                  onClick={() => handleFeedback("too_hot")}
                  className="flex-1 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 font-extrabold text-[11px] transition-all border border-rose-200 shadow-sm flex flex-col items-center"
                >
                  <span className="text-sm">🥵</span>
                  <span>{t("thermal.too_hot")}</span>
                </button>
                <button
                  onClick={() => handleFeedback("good")}
                  className="flex-1 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-600 font-extrabold text-[11px] transition-all border border-emerald-200 shadow-sm flex flex-col items-center"
                >
                  <span className="text-sm">😊</span>
                  <span>{t("thermal.good")}</span>
                </button>
                <button
                  onClick={() => handleFeedback("too_cold")}
                  className="flex-1 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-600 font-extrabold text-[11px] transition-all border border-sky-200 shadow-sm flex flex-col items-center"
                >
                  <span className="text-sm">🥶</span>
                  <span>{t("thermal.too_cold")}</span>
                </button>
              </div>
              
              {/* 피드백 보정치 표시 */}
              {result.recommendations.user_clo_bias !== undefined && (
                <span className="text-[9px] font-bold text-blue-600">
                  {t("ai.feedback_applied")}{result.recommendations.user_clo_bias > 0 ? `+${result.recommendations.user_clo_bias}` : result.recommendations.user_clo_bias} ({t("ai.clo_final")}: {result.recommendations.clo_applied})
                </span>
              )}
            </div>
          )}

                {/* 설정 숏컷 버튼 */}
                <button
                  onClick={() => setActiveTab("settings")}
                  className="absolute right-6 top-6 p-2 rounded-full border bg-white/90 border-slate-200 text-slate-600 hover:text-slate-800 shadow-sm transition-all"
                  title="개인 설정 편집 이동"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </section>

              {/* 홈 화면 하단 안내 문구 */}
              {result && (
                <div className="px-6 py-4 mt-4 w-full">
                  <p className="text-[11px] text-slate-500 leading-relaxed bg-slate-50 border border-slate-100 p-4 rounded-2xl font-medium shadow-sm">
                    {getSummarySentence()}
                  </p>
                </div>
              )}
            </div>
          )}

        {/* Bottom Sheet Details Panel */}
        <section className="bg-white/95 rounded-t-[36px] shadow-[0_-12px_30px_rgba(0,0,0,0.06)] px-5 py-6 flex-1 flex flex-col gap-6 mt-2 border-t border-slate-100 relative pb-16">
          
          {/* 1. 퀵 프로필/체형 편집 슬라이더 패널 (Settings panel) */}
          {showQuickProfile && (
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex flex-col gap-4 animate-in slide-in-from-top duration-300">
              <div className="flex justify-between items-center border-b border-slate-200 pb-1.5">
                <span className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-blue-500" />
                  {t("body.title")}
                </span>
                <button
                  onClick={() => setShowQuickProfile(false)}
                  className="text-[10px] font-extrabold text-slate-400 hover:text-slate-600"
                >
                  ✕ {t("bodyfat.close") || "닫기"}
                </button>
              </div>

              {/* 성별 & 활동 환경 토글 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-400 font-bold block mb-1">{t("body.gender")}</label>
                  <div className="flex bg-slate-200/60 p-0.5 rounded-lg border border-slate-200">
                    <button
                      onClick={() => setGender("male")}
                      className={`flex-1 py-1 rounded text-[11px] font-bold transition-all ${gender === "male" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"}`}
                    >
                      {t("body.male")}
                    </button>
                    <button
                      onClick={() => setGender("female")}
                      className={`flex-1 py-1 rounded text-[11px] font-bold transition-all ${gender === "female" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"}`}
                    >
                      {t("body.female")}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 font-bold block mb-1">{t("body.env")}</label>
                  <div className="flex bg-slate-200/60 p-0.5 rounded-lg border border-slate-200">
                    <button
                      onClick={() => setEnvironment("indoor")}
                      className={`flex-1 py-1 rounded text-[11px] font-bold transition-all ${environment === "indoor" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"}`}
                    >
                      {t("body.indoor")}
                    </button>
                    <button
                      onClick={() => setEnvironment("outdoor")}
                      className={`flex-1 py-1 rounded text-[11px] font-bold transition-all ${environment === "outdoor" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"}`}
                    >
                      {t("body.outdoor")}
                    </button>
                  </div>
                </div>
              </div>

              {/* 키 슬라이더 */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[10px] font-bold text-slate-500">
                  <span>{t("body.height")}</span>
                  <span className="text-blue-600 font-black">{height}cm</span>
                </div>
                <input
                  type="range"
                  min="100"
                  max="220"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>

              {/* 몸무게 슬라이더 */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[10px] font-bold text-slate-500">
                  <span>{t("body.weight")}</span>
                  <span className="text-blue-600 font-black">{weight}kg</span>
                </div>
                <input
                  type="range"
                  min="30"
                  max="150"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>

              {/* 체지방률 슬라이더 */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[10px] font-bold text-slate-500 items-center">
                  <span className="flex items-center gap-1">
                    {t("body.fat")}
                    <button 
                      type="button"
                      onClick={() => {
                        setGuideGenderTab(gender);
                        setShowBodyFatGuide(true);
                      }}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <HelpCircle className="w-3.5 h-3.5 text-blue-500" />
                    </button>
                  </span>
                  <span className="text-blue-600 font-black">{bodyFat}%</span>
                </div>
                <input
                  type="range"
                  min="3"
                  max="50"
                  value={bodyFat}
                  onChange={(e) => setBodyFat(e.target.value)}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>

              {/* 나이 슬라이더 [신설] */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[10px] font-bold text-slate-500">
                  <span>{lang === "ko" ? "나이" : lang === "en" ? "Age" : "年齢"}</span>
                  <span className="text-purple-600 font-black">{age}세</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="90"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
                <div className="flex justify-between text-[9px] text-slate-400">
                  <span>어린이</span>
                  <span>청년</span>
                  <span>중년</span>
                  <span>노년</span>
                </div>
              </div>

              {/* 활동 수준 [신설] */}
              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1">
                  {lang === "ko" ? "활동 수준" : lang === "en" ? "Activity Level" : "活動レベル"}
                </label>
                <div className="flex bg-slate-200/60 p-0.5 rounded-lg border border-slate-200">
                  <button
                    onClick={() => setActivityLevel("sedentary")}
                    className={`flex-1 py-1 rounded text-[10px] font-bold transition-all ${
                      activityLevel === "sedentary" ? "bg-white text-slate-700 shadow-sm" : "text-slate-500"
                    }`}
                  >
                    {lang === "ko" ? "안정" : "Calm"}
                  </button>
                  <button
                    onClick={() => setActivityLevel("walking")}
                    className={`flex-1 py-1 rounded text-[10px] font-bold transition-all ${
                      activityLevel === "walking" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"
                    }`}
                  >
                    {lang === "ko" ? "보행" : "Walk"}
                  </button>
                  <button
                    onClick={() => setActivityLevel("jogging")}
                    className={`flex-1 py-1 rounded text-[10px] font-bold transition-all ${
                      activityLevel === "jogging" ? "bg-white text-orange-600 shadow-sm" : "text-slate-500"
                    }`}
                  >
                    {lang === "ko" ? "조깅" : "Jog"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 2. 오늘의 가이드 요약 (의류 / 수분 / 활동) */}
          <div className="flex flex-col gap-3">
            <span className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-blue-500" />
              {t("ai.title")}
            </span>
            
            {error && (
              <div className="text-[10px] text-red-500 bg-red-50 border border-red-200 rounded-xl px-3 py-1.5">
                ⚠️ {error}
              </div>
            )}

            {/* 리치 3단 가이드 리스트 */}
            <div className="flex flex-col gap-2.5">
              <div className="p-3.5 rounded-2xl bg-gradient-to-br from-blue-50/80 to-indigo-50/60 border border-blue-200/40 flex gap-3 items-start hover:border-blue-300/60 hover:shadow-md hover:shadow-blue-100/50 transition-all duration-200 backdrop-blur-sm">
                <div className="p-2 rounded-xl bg-blue-500/15 text-blue-600 shrink-0 mt-0.5 shadow-sm shadow-blue-100">
                  <Shirt className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-[11px] text-slate-500 font-black tracking-wider uppercase">{t("ai.clothing")}</h4>
                  <p className="text-xs text-slate-800 font-bold mt-1 leading-relaxed">
                    {result?.recommendations?.clothing
                      ? (Array.isArray(result.recommendations.clothing)
                        ? result.recommendations.clothing.join(", ")
                        : result.recommendations.clothing)
                      : isLoading ? <span className="animate-pulse text-slate-400">{t("ai.loading")}</span> : t("ai.empty")}
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-gradient-to-br from-cyan-50/80 to-teal-50/60 border border-cyan-200/40 flex gap-3 items-start hover:border-cyan-300/60 hover:shadow-md hover:shadow-cyan-100/50 transition-all duration-200 backdrop-blur-sm">
                <div className="p-2 rounded-xl bg-cyan-500/15 text-cyan-600 shrink-0 mt-0.5 shadow-sm shadow-cyan-100">
                  <Droplet className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-[11px] text-slate-500 font-black tracking-wider uppercase">{t("ai.hydration")}</h4>
                  <p className="text-xs text-slate-800 font-bold mt-1 leading-relaxed">
                    {result?.recommendations?.hydration || (isLoading ? t("ai.loading") : t("ai.empty"))}
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-gradient-to-br from-amber-50/80 to-orange-50/60 border border-amber-200/40 flex gap-3 items-start hover:border-amber-300/60 hover:shadow-md hover:shadow-amber-100/50 transition-all duration-200 backdrop-blur-sm">
                <div className="p-2 rounded-xl bg-orange-500/15 text-orange-600 shrink-0 mt-0.5 shadow-sm shadow-orange-100">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-[11px] text-slate-500 font-black tracking-wider uppercase">{t("ai.activity")}</h4>
                  <p className="text-xs text-slate-800 font-bold mt-1 leading-relaxed">
                    {result?.recommendations?.activity || (isLoading ? t("ai.loading") : t("ai.empty"))}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 10단계: 활동별 야외 적합 지수 카드 목록 */}
          {result && (
            <div className="flex flex-col gap-3 bg-white/40 p-4 rounded-3xl border border-slate-100/80 shadow-sm backdrop-blur-sm">
              <span className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-500" />
                {t("activity.suitability") || "활동별 야외 적합 지수"}
              </span>
              
              <div className="grid grid-cols-3 gap-2.5 mt-1.5">
                {getActivitySuitability(result.utci_personalized ?? result.utci ?? 0).map((act, idx) => (
                  <div 
                    key={idx} 
                    className="p-3 rounded-2xl border bg-white/60 hover:bg-white hover:border-emerald-200 hover:shadow-md hover:shadow-emerald-50/50 transition-all duration-200 flex flex-col items-center text-center gap-1"
                  >
                    <span className="text-[11px] font-black text-slate-700">{act.name}</span>
                    <span className={`text-[8px] font-black px-2 py-0.5 rounded-full border ${act.color}`}>
                      {act.label}
                    </span>
                    <span className="text-sm font-black text-slate-900 mt-0.5">{act.score}점</span>
                    {/* 게이지 바 */}
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1 shadow-inner">
                      <div className={`h-full ${act.barColor}`} style={{ width: `${act.score}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. 시간대별 체감 지수 예보 (선형 차트) */}
          <div className="flex flex-col gap-3 bg-white/40 p-4 rounded-3xl border border-slate-100/80 shadow-sm">
            <span className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-blue-500" />
                {t("time.title") || "시간대별 체감 지수 예보"}
              </span>
              <span className="text-[10px] text-slate-400 font-semibold">(차트 터치로 시간 변경)</span>
            </span>

            {/* Recharts ComposedChart - Area 그라데이션 + 위험구간 밴드 */}
            <div className="h-44 w-full mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={times.map((t) => {
                    const res = hourlyResults[t];
                    const tempVal = res?.weather?.temperature ?? 0;
                    const utciVal = res?.utci_personalized ?? res?.utci ?? 0;
                    return {
                      time: t,
                      "체감 온도": Math.round(utciVal * 10) / 10,
                      "실제 기온": Math.round(tempVal * 10) / 10,
                      sensation: res?.thermal_sensation ?? "",
                      clothing: res?.recommendations?.clothing ?? [],
                    };
                  })}
                  margin={{ top: 10, right: 15, left: -25, bottom: 5 }}
                  onClick={(e) => {
                    if (e && e.activeLabel) {
                      setSelectedTime(String(e.activeLabel));
                    }
                  }}
                >
                  {/* SVG 그라데이션 정의 */}
                  <defs>
                    <linearGradient id="utciAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis 
                    dataKey="time" 
                    tick={{ fontSize: 9, fontWeight: 800, fill: "#64748b" }} 
                    axisLine={false} 
                    tickLine={false} 
                  />
                  <YAxis 
                    tick={{ fontSize: 9, fontWeight: 700, fill: "#64748b" }} 
                    axisLine={false} 
                    tickLine={false} 
                    domain={["auto", "auto"]} 
                  />
                  <Tooltip 
                    content={<CustomChartTooltip />} 
                    cursor={{ stroke: "rgba(96, 165, 250, 0.2)", strokeWidth: 2 }} 
                  />
                  {/* 쾌적 범위 경계 가이드 라인 */}
                  <ReferenceLine y={32} stroke="#ef4444" strokeDasharray="4 3" opacity={0.6} label={{ value: "열위험", position: "insideTopRight", fontSize: 8, fill: "#ef4444" }} />
                  <ReferenceLine y={26} stroke="#f97316" strokeDasharray="3 3" opacity={0.45} />
                  <ReferenceLine y={9} stroke="#10b981" strokeDasharray="3 3" opacity={0.45} />
                  
                  {/* 체감 온도 Area (그라데이션 채우기) */}
                  <Area
                    type="monotone"
                    dataKey="체감 온도"
                    stroke="none"
                    fill="url(#utciAreaGrad)"
                    fillOpacity={1}
                    isAnimationActive={true}
                    animationDuration={600}
                  />
                  {/* 실제 기온 보조 선 */}
                  <Line 
                    type="monotone" 
                    dataKey="실제 기온" 
                    stroke="#94a3b8"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

          {/* 하단 탭 내비게이션 바 컴포넌트 */}
          <nav className="absolute bottom-0 left-0 right-0 h-16 bg-slate-900 border-t border-slate-950 text-white flex justify-around items-center z-30 px-2 shadow-lg">
        <button
          onClick={() => setActiveTab("home")}
          className={`flex flex-col items-center gap-1 flex-1 py-1.5 transition-all duration-200 ${
            activeTab === "home" ? "text-blue-400 scale-105 font-black" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Thermometer className="w-5 h-5" />
          <span className="text-[9px] tracking-tight">{lang === "ko" ? "홈" : "Home"}</span>
        </button>
        <button
          onClick={() => setActiveTab("hourly")}
          className={`flex flex-col items-center gap-1 flex-1 py-1.5 transition-all duration-200 ${
            activeTab === "hourly" ? "text-blue-400 scale-105 font-black" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Sliders className="w-5 h-5" />
          <span className="text-[9px] tracking-tight">{lang === "ko" ? "시간별" : "Hourly"}</span>
        </button>
        <button
          onClick={() => setActiveTab("clothing")}
          className={`flex flex-col items-center gap-1 flex-1 py-1.5 transition-all duration-200 ${
            activeTab === "clothing" ? "text-blue-400 scale-105 font-black" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Shirt className="w-5 h-5" />
          <span className="text-[9px] tracking-tight">{lang === "ko" ? "의류" : "Clothing"}</span>
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className={`flex flex-col items-center gap-1 flex-1 py-1.5 transition-all duration-200 ${
            activeTab === "settings" ? "text-blue-400 scale-105 font-black" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Settings className="w-5 h-5" />
          <span className="text-[9px] tracking-tight">{lang === "ko" ? "설정" : "Settings"}</span>
        </button>
      </nav>
      </div>
      </div>
      </div>

      {/* 피드백 토스트 알림 */}
      {feedbackToast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-xl border text-[12px] font-bold animate-in fade-in slide-in-from-bottom-3 duration-300 ${
          feedbackToast.type === "success"
            ? "bg-green-50 border-green-200 text-green-700"
            : "bg-red-50 border-red-200 text-red-700"
        }`}>
          <span>{feedbackToast.type === "success" ? "✅" : "❌"}</span>
          <span>{feedbackToast.msg}</span>
        </div>
      )}

      {/* Supabase Auth 간이 로그인/회원가입 모달 */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 transition-opacity">
          <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-xl w-full max-w-sm flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-800">
                {isSignUp ? t("auth.signup") : t("auth.login")}
              </h3>
              <button 
                onClick={() => { setShowAuthModal(false); setAuthError(null); }}
                className="text-slate-400 hover:text-slate-600 font-extrabold text-xs"
              >
                ✕
              </button>
            </div>

            {authError && (
              <div className="text-[10px] text-red-500 bg-red-50 border border-red-200 p-2 rounded-lg">
                ⚠️ {authError}
              </div>
            )}

            <form onSubmit={isSignUp ? handleSignUp : handleSignIn} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-slate-500 font-bold">{t("auth.email")}</label>
                <input
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="name@example.com"
                  required
                  className="px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-slate-500 font-bold">{t("auth.password")}</label>
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="mt-2 w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors shadow disabled:opacity-50"
              >
                {authLoading ? t("ai.loading") : (isSignUp ? t("auth.submit_signup") : t("auth.submit_login"))}
              </button>
            </form>

            <div className="text-center pt-2 border-t border-slate-100 text-[10px]">
              <button 
                onClick={() => { setIsSignUp(!isSignUp); setAuthError(null); }}
                className="text-blue-500 hover:text-blue-700 font-bold"
              >
                {isSignUp ? t("auth.switch_login") : t("auth.switch_signup")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 체지방률 도움말 모달 */}
      {showBodyFatGuide && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 transition-opacity">
          <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-xl w-full max-w-lg flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4 text-blue-500" />
                  {t("bodyfat.guide_title")}
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">{t("bodyfat.guide_desc")}</p>
              </div>
              <button 
                onClick={() => setShowBodyFatGuide(false)}
                className="text-slate-400 hover:text-slate-650 font-extrabold text-sm p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
              >
                {t("bodyfat.close")}
              </button>
            </div>

            {/* 성별 탭 */}
            <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setGuideGenderTab("male")}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${guideGenderTab === "male" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                {t("bodyfat.male")}
              </button>
              <button
                type="button"
                onClick={() => setGuideGenderTab("female")}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${guideGenderTab === "female" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                {t("bodyfat.female")}
              </button>
            </div>

            {/* 본문 콘텐츠 */}
            <div className="flex flex-col gap-4">
              {/* 체형 일러스트 */}
              <div className="relative border border-slate-200/80 rounded-xl overflow-hidden bg-slate-50 flex items-center justify-center p-2 min-h-[160px]">
                {guideGenderTab === "male" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img 
                    src="/male_body_fat_guide.png" 
                    alt="남성 체지방률 가이드" 
                    className="max-h-[180px] object-contain rounded-lg transition-opacity duration-300"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img 
                    src="/female_body_fat_guide.png" 
                    alt="여성 체지방률 가이드" 
                    className="max-h-[180px] object-contain rounded-lg transition-opacity duration-300"
                  />
                )}
              </div>

              {/* 퀵클릭 구간 선택 리스트 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {guideGenderTab === "male" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleQuickFillBodyFat("11")}
                      className="p-3 border border-slate-200 hover:border-blue-400 hover:bg-blue-50/30 rounded-xl text-left transition-all"
                    >
                      <div className="text-[11px] font-black text-slate-700">{t("bodyfat.athlete_title_m")}</div>
                      <div className="text-[9px] text-slate-400 mt-1 leading-normal">{t("bodyfat.athlete_desc_m")}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickFillBodyFat("15")}
                      className="p-3 border border-slate-200 hover:border-blue-400 hover:bg-blue-50/30 rounded-xl text-left transition-all"
                    >
                      <div className="text-[11px] font-black text-slate-700">{t("bodyfat.fit_title_m")}</div>
                      <div className="text-[9px] text-slate-400 mt-1 leading-normal">{t("bodyfat.fit_desc_m")}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickFillBodyFat("20")}
                      className="p-3 border border-slate-200 hover:border-blue-400 hover:bg-blue-50/30 rounded-xl text-left transition-all"
                    >
                      <div className="text-[11px] font-black text-slate-700">{t("bodyfat.normal_title_m")}</div>
                      <div className="text-[9px] text-slate-400 mt-1 leading-normal">{t("bodyfat.normal_desc_m")}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickFillBodyFat("26")}
                      className="p-3 border border-slate-200 hover:border-blue-400 hover:bg-blue-50/30 rounded-xl text-left transition-all"
                    >
                      <div className="text-[11px] font-black text-slate-700">{t("bodyfat.overweight_title_m")}</div>
                      <div className="text-[9px] text-slate-400 mt-1 leading-normal">{t("bodyfat.overweight_desc_m")}</div>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => handleQuickFillBodyFat("19")}
                      className="p-3 border border-slate-200 hover:border-blue-400 hover:bg-blue-50/30 rounded-xl text-left transition-all"
                    >
                      <div className="text-[11px] font-black text-slate-700">{t("bodyfat.athlete_title_f")}</div>
                      <div className="text-[9px] text-slate-400 mt-1 leading-normal">{t("bodyfat.athlete_desc_f")}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickFillBodyFat("22")}
                      className="p-3 border border-slate-200 hover:border-blue-400 hover:bg-blue-50/30 rounded-xl text-left transition-all"
                    >
                      <div className="text-[11px] font-black text-slate-700">{t("bodyfat.fit_title_f")}</div>
                      <div className="text-[9px] text-slate-400 mt-1 leading-normal">{t("bodyfat.fit_desc_f")}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickFillBodyFat("28")}
                      className="p-3 border border-slate-200 hover:border-blue-400 hover:bg-blue-50/30 rounded-xl text-left transition-all"
                    >
                      <div className="text-[11px] font-black text-slate-700">{t("bodyfat.normal_title_f")}</div>
                      <div className="text-[9px] text-slate-400 mt-1 leading-normal">{t("bodyfat.normal_desc_f")}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickFillBodyFat("33")}
                      className="p-3 border border-slate-200 hover:border-blue-400 hover:bg-blue-50/30 rounded-xl text-left transition-all"
                    >
                      <div className="text-[11px] font-black text-slate-700">{t("bodyfat.overweight_title_f")}</div>
                      <div className="text-[9px] text-slate-400 mt-1 leading-normal">{t("bodyfat.overweight_desc_f")}</div>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* 5. 위치 직접 변경 및 지도 보기 고급 글래스모피즘 모달 */}
      {isLocationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-white/95 w-full max-w-sm rounded-3xl border border-slate-100 p-5 shadow-2xl relative flex flex-col gap-4 animate-in zoom-in-95 duration-200">
            {/* 모달 헤더 */}
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                <Map className="w-4 h-4 text-blue-500" />
                {t("location.title") || "현재 위치 설정 / 지도 보기"}
              </span>
              <button 
                onClick={() => setIsLocationModalOpen(false)}
                className="p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
              >
                <span className="text-sm font-bold">✕</span>
              </button>
            </div>
            
            {/* 셀렉트박스 변경 */}
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{t("location.sido")}</label>
                <select
                  value={selectedSido}
                  onChange={(e) => {
                    const newSido = e.target.value;
                    setSelectedSido(newSido);
                    const firstSigungu = regions[newSido]?.[0] ?? "";
                    setSelectedSigungu(firstSigungu);
                    if (newSido && firstSigungu) {
                      handleAnalyzeAllHours({ sido: newSido, sigungu: firstSigungu });
                    }
                  }}
                  className="w-full px-2 py-1.5 border border-slate-200 bg-white text-[11px] font-bold rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {sidoList.map((sido) => (
                    <option key={sido} value={sido}>{tSido(sido)}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{t("location.sigungu")}</label>
                <select
                  value={selectedSigungu}
                  onChange={(e) => {
                    const newSigungu = e.target.value;
                    setSelectedSigungu(newSigungu);
                    if (selectedSido && newSigungu) {
                      handleAnalyzeAllHours({ sigungu: newSigungu });
                    }
                  }}
                  className="w-full px-2 py-1.5 border border-slate-200 bg-white text-[11px] font-bold rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {sigunguList.map((gu) => (
                    <option key={gu} value={gu}>{tSigungu(gu)}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 미니 구글맵 프레임 */}
            <div className="relative h-48 rounded-2xl border border-slate-200 overflow-hidden shadow-inner mt-1">
              <iframe
                title="Google Maps"
                width="100%"
                height="100%"
                frameBorder="0"
                style={{ border: 0, filter: "opacity(0.85) grayscale(20%)" }}
                src={`https://maps.google.com/maps?q=${encodeURIComponent(selectedSido + " " + selectedSigungu)}&t=&z=13&ie=UTF8&iwloc=&output=embed`}
                allowFullScreen
              />
            </div>
            
            {/* 완료 버튼 */}
            <button
              onClick={() => setIsLocationModalOpen(false)}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition-colors"
            >
              확인 및 적용
            </button>
          </div>
        </div>
      )}
    </>
  );
}
