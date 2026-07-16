"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createClient, Session, User } from "@supabase/supabase-js";
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Activity as ActivityIcon,
  CalendarDays,
  Check,
  ChevronRight,
  CloudSun,
  Droplets,
  LogIn,
  MapPin,
  Menu,
  Navigation,
  Plus,
  Search,
  Settings,
  Shirt,
  SlidersHorizontal,
  Sparkles,
  ThermometerSun,
  Trash2,
  Umbrella,
  UserRound,
  Wind,
  X,
} from "lucide-react";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8002";
const CONSENT_POLICY_VERSION = "2026-07-15";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Supabase public configuration is missing.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

type Tab = "home" | "hourly" | "clothing" | "settings";
type Activity = "sedentary" | "walking" | "commute" | "cycling" | "running" | "outdoor_work" | "indoor_exercise";
type Environment = "outdoor" | "indoor" | "mixed";
type Sex = "female" | "male" | "undisclosed";

interface UserProfile {
  height_cm: string;
  weight_kg: string;
  body_fat_pct: string;
  birth_year: string;
  sex: Sex;
  thermal_sensitivity: number;
  default_activity: Activity;
  default_environment: Environment;
  indoor_temperature_c: string;
}

interface Recommendation {
  forecast_time?: string | null;
  utci: number;
  utci_personalized: number;
  thermal_sensation: string;
  weather?: { temperature: number; humidity: number; wind_speed: number; precipitation_probability?: number };
  recommendations: { clothing: string[]; hydration: string; activity: string };
  nudge?: { nudge_warning: boolean; nudge_message: string };
  suitability?: { name: string; score: number }[];
  personalization?: { wardrobe_items_used: number; feedback_warmth_bias: number; target_warmth_level: number; current_season: string };
}

interface DailyForecast {
  date: string;
  temperature_min: number;
  temperature_max: number;
  humidity_avg: number | null;
  precipitation_probability_max: number;
}

interface HourlyForecast {
  time: string;
  temperature: number;
  apparent_temperature: number;
  humidity: number | null;
  wind_speed: number | null;
  precipitation_probability: number;
  utci: number | null;
}

interface WardrobeItem {
  id: string;
  name: string;
  category: "top" | "bottom" | "outerwear" | "shoes" | "accessory" | "other";
  subcategory?: string | null;
  material?: string | null;
  notes?: string | null;
  warmth_level: number;
  water_resistant: boolean;
  is_favorite: boolean;
  seasons: ("spring" | "summer" | "fall" | "winter")[];
  is_in_laundry: boolean;
}

interface SavedLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  is_favorite: boolean;
}

interface LocationOption {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  sido?: string;
  sigungu?: string;
  is_favorite?: boolean;
}

interface SelectedLocation {
  latitude: number;
  longitude: number;
  label: string;
}

interface ActivityPlan {
  activity: Activity;
  environment: Environment;
  startHourIndex: number;
  durationHours: number;
}

const emptyProfile: UserProfile = {
  height_cm: "",
  weight_kg: "",
  body_fat_pct: "",
  birth_year: "",
  sex: "undisclosed",
  thermal_sensitivity: 0,
  default_activity: "walking",
  default_environment: "outdoor",
  indoor_temperature_c: "",
};

const HOURLY_FORECAST_COUNT = 6;

function getHourlyForecastIndices(now = new Date()) {
  // The API forecast timeline starts at today's midnight. Do not cap at 23:
  // tomorrow's early-morning entries follow as 24, 25, and so on.
  return Array.from({ length: HOURLY_FORECAST_COUNT }, (_, index) => now.getHours() + index);
}

function forecastChartLabel(index: number) {
  const hour = index % 24;
  return `${index >= 24 ? "내일 " : ""}${String(hour).padStart(2, "0")}시`;
}

const activityLabels: Record<Activity, string> = {
  sedentary: "휴식",
  walking: "가벼운 걷기",
  commute: "출퇴근",
  cycling: "자전거",
  running: "러닝",
  outdoor_work: "야외 작업",
  indoor_exercise: "실내 운동",
};

const environmentLabels: Record<Environment, string> = {
  outdoor: "외부 활동",
  indoor: "실내 활동",
  mixed: "실내외 혼합",
};

function formatError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatApiDetail(detail: unknown, fallback: string) {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail.map((item) => {
      if (!item || typeof item !== "object") return null;
      const validationError = item as { loc?: unknown; msg?: unknown };
      const field = Array.isArray(validationError.loc) ? validationError.loc.filter((part) => part !== "body").join(".") : "";
      return typeof validationError.msg === "string" ? (field ? `${field}: ${validationError.msg}` : validationError.msg) : null;
    }).filter((message): message is string => Boolean(message));
    if (messages.length) return messages.join(" / ");
  }
  return fallback;
}

function parseOptionalNumber(value: string) {
  return value.trim() === "" ? undefined : Number(value);
}

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const initialAnalysisStarted = useRef(false);
  const analysisRequestId = useRef(0);
  const dailyForecastRequestId = useRef(0);
  const loadProfileRef = useRef<(() => Promise<void>) | null>(null);
  const loadDashboardRef = useRef<(() => Promise<void>) | null>(null);
  const [profile, setProfile] = useState<UserProfile>(emptyProfile);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signIn" | "signUp">("signIn");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [marketingAccepted, setMarketingAccepted] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [hourlyRecommendations, setHourlyRecommendations] = useState<Record<number, Recommendation>>({});
  const [activityPlan, setActivityPlan] = useState<ActivityPlan>(() => ({ activity: "walking", environment: "outdoor", startHourIndex: new Date().getHours(), durationHours: HOURLY_FORECAST_COUNT }));
  const activityPlanCustomized = useRef(false);
  const [dailyForecast, setDailyForecast] = useState<DailyForecast[]>([]);
  const [dailyForecastLoading, setDailyForecastLoading] = useState(false);
  const [dailyForecastError, setDailyForecastError] = useState<string | null>(null);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [selectedFeedback, setSelectedFeedback] = useState<"too_hot" | "comfortable" | "too_cold" | null>(null);
  const [wardrobeItems, setWardrobeItems] = useState<WardrobeItem[]>([]);
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([]);
  const [locationCatalog, setLocationCatalog] = useState<LocationOption[]>([]);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [wardrobeMessage, setWardrobeMessage] = useState<string | null>(null);
  const [location, setLocation] = useState<SelectedLocation>({ latitude: 37.5264, longitude: 126.8962, label: "서울 영등포구" });

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setAuthResolved(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      initialAnalysisStarted.current = false;
      setProfileReady(false);
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setAuthResolved(true);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    void fetch(`${API_BASE_URL}/api/v1/locations`)
      .then(async (response) => {
        if (!response.ok) throw new Error("장소 목록을 불러오지 못했습니다.");
        return await response.json() as { locations: LocationOption[] };
      })
      .then((data) => { if (mounted) setLocationCatalog(data.locations); })
      .catch((error: unknown) => { if (mounted) setRecommendationError(formatError(error, "장소 목록을 불러오지 못했습니다.")); });
    return () => { mounted = false; };
  }, []);

  async function persistPendingConsents(accessToken: string) {
    const pending = localStorage.getItem("pcrs_pending_consents");
    if (!pending) return;
    const choices: { terms: boolean; privacy: boolean; marketing: boolean } = JSON.parse(pending);
    const response = await fetch(`${API_BASE_URL}/api/v1/me/consents`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ ...choices, policy_version: CONSENT_POLICY_VERSION }),
    });
    if (response.ok) localStorage.removeItem("pcrs_pending_consents");
  }

  async function loadProfile() {
    if (!session) return;
    setBusy(true);
    setSaveMessage(null);
    try {
      await persistPendingConsents(session.access_token);
      const response = await fetch(`${API_BASE_URL}/api/v1/me/profile`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) throw new Error("프로필을 불러올 수 없습니다. DB 마이그레이션 적용 여부를 확인해 주세요.");
      const data: { profile: Partial<Record<keyof UserProfile, string | number>> | null } = await response.json();
      if (data.profile) {
        setProfile({
          height_cm: String(data.profile.height_cm ?? ""),
          weight_kg: String(data.profile.weight_kg ?? ""),
          body_fat_pct: String(data.profile.body_fat_pct ?? ""),
          birth_year: String(data.profile.birth_year ?? ""),
          sex: (data.profile.sex as Sex | undefined) ?? "undisclosed",
          thermal_sensitivity: Number(data.profile.thermal_sensitivity ?? 0),
          default_activity: (data.profile.default_activity as Activity | undefined) ?? "walking",
          default_environment: (data.profile.default_environment as Environment | undefined) ?? "outdoor",
          indoor_temperature_c: String(data.profile.indoor_temperature_c ?? ""),
        });
      }
      setSaveMessage("계정 프로필을 불러왔습니다.");
    } catch (error) {
      setSaveMessage(formatError(error, "프로필을 불러오지 못했습니다."));
    } finally {
      setProfileReady(true);
      setBusy(false);
    }
  }

  async function saveProfile() {
    if (!session) {
      setAuthMode("signIn");
      setAuthOpen(true);
      return;
    }
    setBusy(true);
    setSaveMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/me/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          height_cm: parseOptionalNumber(profile.height_cm),
          weight_kg: parseOptionalNumber(profile.weight_kg),
          body_fat_pct: parseOptionalNumber(profile.body_fat_pct),
          birth_year: parseOptionalNumber(profile.birth_year),
          sex: profile.sex,
          thermal_sensitivity: profile.thermal_sensitivity,
          default_activity: profile.default_activity,
          default_environment: profile.default_environment,
          indoor_temperature_c: parseOptionalNumber(profile.indoor_temperature_c),
        }),
      });
      if (!response.ok) throw new Error("프로필 저장에 실패했습니다. 입력 범위를 확인해 주세요.");
      setSaveMessage("개인화 프로필을 저장했습니다. 최신 분석에 반영했습니다.");
      await loadDashboard();
    } catch (error) {
      setSaveMessage(formatError(error, "프로필을 저장하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }

  function recommendationRequestBody(selectedHour: number | undefined, targetLocation: SelectedLocation, plan?: Pick<ActivityPlan, "activity" | "environment">) {
      const currentYear = new Date().getFullYear();
      const age = profile.birth_year ? Math.max(14, currentYear - Number(profile.birth_year)) : 30;
      const activity = plan?.activity ?? profile.default_activity;
      const environment = plan?.environment ?? profile.default_environment;
      const legacyActivity = activity === "commute" ? "walking" : activity === "outdoor_work" ? "cycling" : activity === "indoor_exercise" ? "sedentary" : activity;
      return {
        latitude: targetLocation.latitude,
        longitude: targetLocation.longitude,
        lang: "ko",
        selected_hour: selectedHour,
        profile: {
          user_id: user?.id ?? "guest",
          height: Number(profile.height_cm) || 171,
          weight: Number(profile.weight_kg) || 60,
          age,
          body_fat: parseOptionalNumber(profile.body_fat_pct),
          gender: profile.sex === "male" ? "male" : "female",
          environment: environment === "indoor" ? "indoor" : "outdoor",
          activity_level: legacyActivity,
        },
      };
  }

  async function requestRecommendation(selectedHour?: number, targetLocation: SelectedLocation = location, plan?: Pick<ActivityPlan, "activity" | "environment">) {
      const response = await fetch(`${API_BASE_URL}${session ? "/api/v1/recommendations" : "/api/v1/recommend"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify(recommendationRequestBody(selectedHour, targetLocation, plan)),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { detail?: string } | null;
        if (response.status === 401) throw new Error("로그인 세션이 만료되었습니다. 다시 로그인해 주세요.");
        throw new Error(formatApiDetail(payload?.detail, `날씨 분석을 불러오지 못했습니다. (${response.status})`));
      }
      return await response.json() as Recommendation;
  }

  async function requestHourlyBatch(selectedHours: number[], targetLocation: SelectedLocation, plan?: Pick<ActivityPlan, "activity" | "environment">) {
    if (!session) return await Promise.all(selectedHours.map(async (hour) => [hour, await requestRecommendation(hour, targetLocation, plan)] as const));
    const requestBody = recommendationRequestBody(undefined, targetLocation, plan);
    const response = await fetch(`${API_BASE_URL}/api/v1/recommendations/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ ...requestBody, selected_hours: selectedHours }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { detail?: unknown } | null;
      throw new Error(formatApiDetail(payload?.detail, `시간별 분석을 불러오지 못했습니다. (${response.status})`));
    }
    const data = await response.json() as { recommendations: { selected_hour: number; recommendation: Recommendation }[] };
    return data.recommendations.map((item) => [item.selected_hour, item.recommendation] as const);
  }

  async function loadDailyForecast(targetLocation: SelectedLocation) {
    const requestId = ++dailyForecastRequestId.current;
    setDailyForecastLoading(true);
    setDailyForecastError(null);
    try {
      const params = new URLSearchParams({
        latitude: String(targetLocation.latitude),
        longitude: String(targetLocation.longitude),
      });
      const response = await fetch(`${API_BASE_URL}/api/v1/weather/daily?${params}`);
      if (!response.ok) throw new Error(`주간 예보를 불러오지 못했습니다. (${response.status})`);
      const data = await response.json() as { daily: DailyForecast[] };
      if (requestId === dailyForecastRequestId.current) setDailyForecast(data.daily);
    } catch (error) {
      if (requestId === dailyForecastRequestId.current) setDailyForecastError(formatError(error, "날짜별 예보를 불러오지 못했습니다."));
      throw error;
    } finally {
      if (requestId === dailyForecastRequestId.current) setDailyForecastLoading(false);
    }
  }

  function refreshDailyForecast() {
    void loadDailyForecast(location).catch(() => undefined);
  }

  async function loadHourlyRecommendations(plan: ActivityPlan = activityPlan) {
    const requestId = ++analysisRequestId.current;
    setBusy(true);
    setRecommendationError(null);
    try {
      const hours = Array.from({ length: plan.durationHours }, (_, index) => plan.startHourIndex + index);
      const entries = await requestHourlyBatch(hours, location, plan);
      if (requestId === analysisRequestId.current) setHourlyRecommendations(Object.fromEntries(entries));
    } catch (error) {
      if (requestId === analysisRequestId.current) setRecommendationError(formatError(error, "시간별 분석을 불러오지 못했습니다."));
    } finally {
      if (requestId === analysisRequestId.current) setBusy(false);
    }
  }

  function applyActivityPlan(nextPlan: ActivityPlan) {
    activityPlanCustomized.current = true;
    setActivityPlan(nextPlan);
    void loadHourlyRecommendations(nextPlan);
  }

  async function loadDashboard(targetLocation: SelectedLocation = location) {
    const requestId = ++analysisRequestId.current;
    const isLatestRequest = () => requestId === analysisRequestId.current;
    setBusy(true);
    setRecommendationError(null);
    setDailyForecast([]);
    try {
      // Show weather-only information first. It is useful without any profile
      // data and warms the shared forecast cache for the personal analysis.
      try {
        await loadDailyForecast(targetLocation);
      } catch {
        // The personalized result can still be useful if the optional daily
        // overview is temporarily unavailable.
      }
      if (!isLatestRequest()) return;
      const hours = getHourlyForecastIndices();
      const current = await requestRecommendation(undefined, targetLocation);
      if (!isLatestRequest()) return;
      setRecommendation(current);
      // The main personalized result is ready. Keep the optional six-hour
      // comparison loading in the background instead of holding the entire
      // dashboard in its loading state.
      setBusy(false);
      // The current result is already available. Fetch the remaining chart
      // points as one request instead of opening five more browser requests.
      const remainingHours = hours.slice(1);
      const hourlyResults = await Promise.allSettled([requestHourlyBatch(remainingHours, targetLocation)]);
      const batchEntries = hourlyResults.flatMap((result) => result.status === "fulfilled" ? result.value : []);
      const entries = [[hours[0], current] as const, ...batchEntries];
      if (!isLatestRequest()) return;
      setHourlyRecommendations(Object.fromEntries(entries));
      if (entries.length < hours.length) setRecommendationError("현재 분석은 표시했습니다. 일부 시간대 분석은 잠시 후 다시 시도해 주세요.");
    } catch (error) {
      if (isLatestRequest()) setRecommendationError(formatError(error, "날씨와 개인화 분석을 불러오지 못했습니다."));
    } finally {
      if (isLatestRequest()) setBusy(false);
    }
  }

  loadProfileRef.current = loadProfile;
  loadDashboardRef.current = loadDashboard;

  useEffect(() => {
    if (!authResolved) return;
    if (!session) return;
    const timer = window.setTimeout(() => { void loadProfileRef.current?.(); }, 0);
    return () => window.clearTimeout(timer);
  }, [authResolved, session]);

  useEffect(() => {
    if (!authResolved || (session && !profileReady) || initialAnalysisStarted.current) return;
    initialAnalysisStarted.current = true;
    const timer = window.setTimeout(() => { void loadDashboardRef.current?.(); }, 0);
    return () => window.clearTimeout(timer);
  }, [authResolved, profileReady, session]);

  useEffect(() => {
    if (activityPlanCustomized.current) return;
    setActivityPlan((plan) => ({ ...plan, activity: profile.default_activity, environment: profile.default_environment }));
  }, [profile.default_activity, profile.default_environment]);

  async function loadWardrobe() {
    if (!session) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/me/wardrobe`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!response.ok) throw new Error("옷장을 불러오지 못했습니다.");
      const data = await response.json() as { items: WardrobeItem[] };
      setWardrobeItems(data.items);
    } catch (error) {
      setWardrobeMessage(formatError(error, "옷장을 불러오지 못했습니다."));
    }
  }

  async function addWardrobe(item: Omit<WardrobeItem, "id">) {
    if (!session) {
      setActiveTab("settings");
      setAuthMode("signIn");
      setAuthOpen(true);
      return;
    }
    setBusy(true);
    setWardrobeMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/me/wardrobe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(item),
      });
      if (!response.ok) throw new Error("의류를 저장하지 못했습니다.");
      const data = await response.json() as { item: WardrobeItem };
      setWardrobeItems((items) => [data.item, ...items]);
      setWardrobeMessage("옷장에 추가했습니다.");
    } catch (error) {
      setWardrobeMessage(formatError(error, "의류를 저장하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }

  async function removeWardrobe(itemId: string) {
    if (!session) return;
    setBusy(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/me/wardrobe/${itemId}`, { method: "DELETE", headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!response.ok) throw new Error("의류를 삭제하지 못했습니다.");
      setWardrobeItems((items) => items.filter((item) => item.id !== itemId));
    } catch (error) {
      setWardrobeMessage(formatError(error, "의류를 삭제하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }

  async function updateWardrobe(itemId: string, item: Omit<WardrobeItem, "id">) {
    if (!session) return;
    setBusy(true);
    setWardrobeMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/me/wardrobe/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(item),
      });
      if (!response.ok) throw new Error("의류 정보를 수정하지 못했습니다.");
      const data = await response.json() as { item: WardrobeItem };
      setWardrobeItems((items) => items.map((current) => current.id === itemId ? data.item : current));
      setWardrobeMessage("옷 정보를 수정했습니다.");
    } catch (error) {
      setWardrobeMessage(formatError(error, "의류 정보를 수정하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }

  async function loadSavedLocations() {
    if (!session) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/me/locations`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!response.ok) throw new Error("저장한 장소를 불러오지 못했습니다.");
      const data = await response.json() as { locations: SavedLocation[] };
      setSavedLocations(data.locations);
    } catch (error) {
      setSaveMessage(formatError(error, "저장한 장소를 불러오지 못했습니다."));
    }
  }

  function selectLocation(nextLocation: LocationOption | SavedLocation) {
    const selected: SelectedLocation = {
      latitude: nextLocation.latitude,
      longitude: nextLocation.longitude,
      label: nextLocation.name,
    };
    setLocation(selected);
    setLocationPickerOpen(false);
    setQuickMenuOpen(false);
    void loadDashboard(selected);
  }

  async function saveCurrentLocation() {
    if (!session) return;
    setBusy(true);
    setSaveMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/me/locations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ name: location.label, latitude: location.latitude, longitude: location.longitude, is_favorite: true }),
      });
      if (!response.ok) throw new Error("현재 장소를 저장하지 못했습니다.");
      const data = await response.json() as { location: SavedLocation };
      setSavedLocations((locations) => [data.location, ...locations]);
      setSaveMessage("현재 장소를 즐겨찾기에 저장했습니다.");
    } catch (error) {
      setSaveMessage(formatError(error, "현재 장소를 저장하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }

  async function removeSavedLocation(locationId: string) {
    if (!session) return;
    setBusy(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/me/locations/${locationId}`, { method: "DELETE", headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!response.ok) throw new Error("장소를 삭제하지 못했습니다.");
      setSavedLocations((locations) => locations.filter((item) => item.id !== locationId));
    } catch (error) {
      setSaveMessage(formatError(error, "장소를 삭제하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }

  async function submitFeedback(feedbackType: "too_hot" | "comfortable" | "too_cold") {
    if (!session || !recommendation) {
      setActiveTab("settings");
      setAuthMode("signIn");
      setAuthOpen(true);
      return;
    }
    try {
      setBusy(true);
      setFeedbackMessage(null);
      const response = await fetch(`${API_BASE_URL}/api/v1/me/recommendation-feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ feedback_type: feedbackType, utci_personalized: recommendation.utci_personalized, activity: profile.default_activity }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(payload?.detail || "피드백을 저장하지 못했습니다.");
      }
      const data = await response.json() as { warmth_bias: number };
      setSelectedFeedback(feedbackType);
      const sign = data.warmth_bias > 0 ? "+" : "";
      setFeedbackMessage(`저장됨 · 다음 추천의 보온 선호 ${sign}${data.warmth_bias.toFixed(1)} 단계로 반영했습니다.`);
      await loadDashboard();
    } catch (error) {
      setFeedbackMessage(formatError(error, "피드백을 저장하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError(null);
    setAuthMessage(null);
    setBusy(true);
    try {
      if (authMode === "signUp") {
        if (!termsAccepted || !privacyAccepted) throw new Error("이용약관과 개인정보 처리방침에 동의해 주세요.");
        localStorage.setItem("pcrs_pending_consents", JSON.stringify({ terms: true, privacy: true, marketing: marketingAccepted }));
        const { data, error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
          options: { emailRedirectTo: `${window.location.origin}/app` },
        });
        if (error) throw error;
        if (data.session) await persistPendingConsents(data.session.access_token);
        setAuthMessage("가입 확인 이메일을 보냈습니다. 이메일 인증 후 로그인해 주세요.");
        return;
      }
      const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
      if (error) throw error;
      if (data.session) await persistPendingConsents(data.session.access_token);
      setAuthOpen(false);
      setAuthPassword("");
    } catch (error) {
      setAuthError(formatError(error, "인증 처리에 실패했습니다."));
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    if (authMode === "signUp" && (!termsAccepted || !privacyAccepted)) {
      setAuthError("Google 가입 전 이용약관과 개인정보 처리방침에 동의해 주세요.");
      return;
    }
    if (authMode === "signUp") localStorage.setItem("pcrs_pending_consents", JSON.stringify({ terms: true, privacy: true, marketing: marketingAccepted }));
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/app` } });
    if (error) setAuthError(error.message);
  }

  async function sendPasswordReset() {
    if (!authEmail) {
      setAuthError("비밀번호를 재설정할 이메일을 입력해 주세요.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(authEmail, { redirectTo: `${window.location.origin}/app` });
    if (error) setAuthError(error.message);
    else setAuthMessage("비밀번호 재설정 링크를 이메일로 보냈습니다.");
  }

  async function updateAccountEmail(email: string) {
    setBusy(true);
    setSaveMessage(null);
    try {
      const { error } = await supabase.auth.updateUser({ email });
      if (error) throw error;
      setSaveMessage("새 이메일로 확인 링크를 보냈습니다. 확인 전까지 현재 이메일이 유지됩니다.");
    } catch (error) {
      setSaveMessage(formatError(error, "이메일 변경을 요청하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }

  async function updateAccountPassword(password: string) {
    setBusy(true);
    setSaveMessage(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSaveMessage("비밀번호를 변경했습니다.");
    } catch (error) {
      setSaveMessage(formatError(error, "비밀번호를 변경하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }

  async function signOut(scope: "local" | "global") {
    const { error } = await supabase.auth.signOut({ scope });
    if (error) setSaveMessage(error.message);
  }

  async function requestAccountDeletion(confirmationPhrase: string) {
    if (!session) return;
    setBusy(true);
    setSaveMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/me/deletion-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ confirmation_phrase: confirmationPhrase }),
      });
      if (!response.ok) throw new Error("탈퇴 요청을 등록하지 못했습니다. 다시 로그인한 뒤 배포 설정을 확인해 주세요.");
      setSaveMessage("탈퇴 요청을 등록했습니다. 30일 안에 취소할 수 있으며, 이후 개인정보가 삭제됩니다.");
    } catch (error) {
      setSaveMessage(formatError(error, "탈퇴 요청을 등록하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }

  async function cancelAccountDeletion() {
    if (!session) return;
    setBusy(true);
    setSaveMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/me/deletion-request`, { method: "DELETE", headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!response.ok) throw new Error("진행 중인 탈퇴 요청이 없습니다.");
      setSaveMessage("탈퇴 요청을 취소했습니다. 계정과 데이터는 계속 유지됩니다.");
    } catch (error) {
      setSaveMessage(formatError(error, "탈퇴 요청을 취소하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }

  async function resetRecommendationFeedback() {
    if (!session) return;
    setBusy(true);
    setSaveMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/me/recommendation-feedback`, { method: "DELETE", headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!response.ok) throw new Error("피드백을 초기화하지 못했습니다.");
      setSaveMessage("누적 착용감 피드백을 초기화했습니다.");
    } catch (error) {
      setSaveMessage(formatError(error, "피드백을 초기화하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }

  async function useCurrentLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const selected = { latitude: coords.latitude, longitude: coords.longitude, label: "현재 위치" };
        setLocation(selected);
        setLocationPickerOpen(false);
        void loadDashboard(selected);
      },
      () => setRecommendationError("위치 권한을 허용하지 않아 기본 위치를 사용합니다."),
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-[radial-gradient(circle_at_15%_0%,#a7e6ff_0%,transparent_33%),linear-gradient(155deg,#1b91d4_0%,#2852b8_52%,#142460_100%)] px-0 py-0 text-slate-900 sm:px-6 sm:py-8">
      <section className="mx-auto flex h-dvh min-h-0 min-w-0 w-full max-w-[480px] flex-col overflow-hidden bg-[#f7faff]/95 shadow-2xl sm:rounded-[36px]">
        <header className="flex min-w-0 items-center justify-between bg-[#09265f] px-5 py-4 text-white">
          <div className="flex min-w-0 items-center gap-2"><CloudSun className="shrink-0 text-sky-300" /><div className="min-w-0"><p className="truncate text-sm font-black">THERMAL GUIDE</p><p className="truncate text-[10px] text-sky-200">Personal weather wardrobe</p></div></div>
          {user ? <button onClick={() => setActiveTab("settings")} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold">{user.email ?? "계정"}</button> : <button onClick={() => { setAuthMode("signIn"); setAuthOpen(true); }} className="flex items-center gap-1 rounded-full bg-sky-400 px-3 py-1.5 text-xs font-black text-slate-950"><LogIn size={14} /> 로그인</button>}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 pb-24">
          {activeTab === "home" && <HomeExperience location={location} profile={profile} recommendation={recommendation} hourlyRecommendations={hourlyRecommendations} activityPlan={activityPlan} onApplyActivityPlan={applyActivityPlan} dailyForecast={dailyForecast} dailyForecastLoading={dailyForecastLoading} dailyForecastError={dailyForecastError} onRefreshDailyForecast={refreshDailyForecast} busy={busy} error={recommendationError} feedbackMessage={feedbackMessage} selectedFeedback={selectedFeedback} quickMenuOpen={quickMenuOpen} onLocate={useCurrentLocation} onRefresh={() => { void loadDashboard(); }} onOpenLocationPicker={() => { setQuickMenuOpen(false); setLocationPickerOpen(true); }} onToggleQuickMenu={() => setQuickMenuOpen((open) => !open)} onSettings={() => { setQuickMenuOpen(false); setActiveTab("settings"); }} onFeedback={submitFeedback} />}
          {activeTab === "hourly" && <HourlyTab location={location} forecastDays={dailyForecast} forecastLoading={dailyForecastLoading} forecastError={dailyForecastError} onRefreshForecast={refreshDailyForecast} activity={profile.default_activity} recommendations={hourlyRecommendations} error={recommendationError} />}
          {activeTab === "clothing" && <ClothingTab user={user} items={wardrobeItems} busy={busy} message={wardrobeMessage} onAdd={addWardrobe} onUpdate={updateWardrobe} onDelete={removeWardrobe} onLogin={() => { setAuthMode("signIn"); setAuthOpen(true); }} />}
          {activeTab === "settings" && <SettingsTab user={user} profile={profile} setProfile={setProfile} busy={busy} message={saveMessage} onLoad={loadProfile} onSave={saveProfile} onLogin={() => { setAuthMode("signIn"); setAuthOpen(true); }} onSignOutLocal={() => void signOut("local")} onSignOutAll={() => void signOut("global")} onEmailChange={updateAccountEmail} onPasswordChange={updateAccountPassword} onFeedbackReset={resetRecommendationFeedback} onDeletionRequest={requestAccountDeletion} onDeletionCancel={cancelAccountDeletion} location={location} savedLocations={savedLocations} onLoadLocations={loadSavedLocations} onSaveLocation={saveCurrentLocation} onSelectLocation={selectLocation} onDeleteLocation={removeSavedLocation} />}
        </div>

        <nav className="grid shrink-0 grid-cols-4 border-t border-slate-200 bg-white/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
          <TabButton label="홈" active={activeTab === "home"} onClick={() => setActiveTab("home")} icon={<ThermometerSun size={20} />} />
          <TabButton label="상세 예보" active={activeTab === "hourly"} onClick={() => setActiveTab("hourly")} icon={<SlidersHorizontal size={20} />} />
          <TabButton label="내 옷장" active={activeTab === "clothing"} onClick={() => { setActiveTab("clothing"); void loadWardrobe(); }} icon={<Shirt size={20} />} />
          <TabButton label="설정" active={activeTab === "settings"} onClick={() => setActiveTab("settings")} icon={<Settings size={20} />} />
        </nav>
      </section>

      {authOpen && <AuthModal mode={authMode} email={authEmail} password={authPassword} terms={termsAccepted} privacy={privacyAccepted} marketing={marketingAccepted} busy={busy} message={authMessage} error={authError} onClose={() => setAuthOpen(false)} onModeChange={setAuthMode} onEmailChange={setAuthEmail} onPasswordChange={setAuthPassword} onTermsChange={setTermsAccepted} onPrivacyChange={setPrivacyAccepted} onMarketingChange={setMarketingAccepted} onSubmit={submitAuth} onGoogle={() => void signInWithGoogle()} onReset={() => void sendPasswordReset()} />}
      {locationPickerOpen && <LocationPicker current={location} savedLocations={savedLocations} catalog={locationCatalog} onClose={() => setLocationPickerOpen(false)} onLocate={useCurrentLocation} onSelect={selectLocation} onSaveCurrent={() => void saveCurrentLocation()} />}
    </main>
  );
}

function TabButton({ label, active, onClick, icon }: { label: string; active: boolean; onClick: () => void; icon: React.ReactNode }) {
  return <button onClick={onClick} className={`flex min-w-0 flex-col items-center gap-1 rounded-xl py-1 text-[10px] font-bold transition ${active ? "bg-sky-50 text-blue-600" : "text-slate-400"}`}>{icon}<span className="truncate">{label}</span></button>;
}

function activityScore(item: Recommendation, activity: Activity) {
  const key = activity === "running" ? "러닝" : activity === "cycling" ? "라이딩" : "산책";
  return item.suitability?.find((score) => score.name.includes(key))?.score ?? Math.max(0, 100 - Math.abs(item.utci_personalized - 22) * 6);
}

function HomeExperience({ location, profile, recommendation, hourlyRecommendations, activityPlan, onApplyActivityPlan, dailyForecast, dailyForecastLoading, dailyForecastError, onRefreshDailyForecast, busy, error, feedbackMessage, selectedFeedback, quickMenuOpen, onLocate, onRefresh, onOpenLocationPicker, onToggleQuickMenu, onSettings, onFeedback }: { location: SelectedLocation; profile: UserProfile; recommendation: Recommendation | null; hourlyRecommendations: Record<number, Recommendation>; activityPlan: ActivityPlan; onApplyActivityPlan: (plan: ActivityPlan) => void; dailyForecast: DailyForecast[]; dailyForecastLoading: boolean; dailyForecastError: string | null; onRefreshDailyForecast: () => void; busy: boolean; error: string | null; feedbackMessage: string | null; selectedFeedback: "too_hot" | "comfortable" | "too_cold" | null; quickMenuOpen: boolean; onLocate: () => void; onRefresh: () => void; onOpenLocationPicker: () => void; onToggleQuickMenu: () => void; onSettings: () => void; onFeedback: (feedbackType: "too_hot" | "comfortable" | "too_cold") => void }) {
  const chartData = useMemo(() => Object.entries(hourlyRecommendations).sort(([left], [right]) => Number(left) - Number(right)).map(([hour, item]) => ({ hour: forecastChartLabel(Number(hour)), 체감: Math.round(item.utci_personalized), 활동점수: Math.round(activityScore(item, activityPlan.activity)) })), [hourlyRecommendations, activityPlan.activity]);
  const [activityPlanEditing, setActivityPlanEditing] = useState(false);
  const weather = recommendation?.weather;
  const comfort = recommendation ? Math.max(8, Math.min(92, 50 + (22 - recommendation.utci_personalized) * 2.2)) : 50;
  const clothing = recommendation?.recommendations.clothing ?? ["분석을 시작하면 오늘의 착장을 제안합니다."];
  const activityPlanEndHour = activityPlan.startHourIndex + activityPlan.durationHours - 1;
  const activityPlanSummary = `${activityLabels[activityPlan.activity]} · ${environmentLabels[activityPlan.environment]} · ${forecastChartLabel(activityPlan.startHourIndex)} 시작 · ${activityPlan.durationHours}시간`;

  return <div className="space-y-4">
    <div className="relative flex items-center justify-between">
      <button onClick={onOpenLocationPicker} className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-left shadow-sm ring-1 ring-slate-100"><span className="grid h-7 w-7 place-items-center rounded-xl bg-sky-100 text-blue-600"><MapPin size={15} /></span><span><span className="block text-[10px] font-bold text-slate-400">분석 장소</span><span className="block max-w-44 truncate text-sm font-black text-slate-800">{location.label}</span></span><ChevronRight size={16} className="text-slate-400" /></button>
      <button aria-label="빠른 메뉴" onClick={onToggleQuickMenu} className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-slate-700 shadow-sm ring-1 ring-slate-100"><Menu size={19} /></button>
      {quickMenuOpen && <div className="absolute right-0 top-12 z-20 w-52 rounded-2xl bg-white p-2 shadow-xl ring-1 ring-slate-100"><button onClick={onOpenLocationPicker} className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-xs font-bold hover:bg-sky-50"><MapPin size={15} className="text-blue-600" />장소 선택·저장</button><button onClick={onRefresh} className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-xs font-bold hover:bg-sky-50"><Sparkles size={15} className="text-blue-600" />날씨 새로고침</button><button onClick={onSettings} className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-xs font-bold hover:bg-sky-50"><Settings size={15} className="text-blue-600" />개인화 설정</button></div>}
    </div>

    <section className="overflow-hidden rounded-[30px] bg-[linear-gradient(135deg,#0b5fc4,#168fd4_62%,#72c7ee)] p-5 text-white shadow-lg">
      <div className="flex items-start justify-between"><div><p className="text-xs font-bold text-sky-100">{location.label} · 개인화 체감</p><p className="mt-1 text-5xl font-black tracking-tight">{recommendation ? `${Math.round(recommendation.utci_personalized)}°` : "--°"}</p><p className="mt-2 text-sm font-bold text-white/90">{recommendation?.thermal_sensation ?? "장소와 오늘의 날씨를 분석해 보세요"}</p></div><div className="relative grid h-24 w-24 place-items-center"><svg viewBox="0 0 120 120" className="h-24 w-24 -rotate-90"><circle cx="60" cy="60" r="45" fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="10" /><circle cx="60" cy="60" r="45" fill="none" stroke="#fef08a" strokeWidth="10" strokeLinecap="round" strokeDasharray="283" strokeDashoffset={283 - (283 * comfort) / 100} /></svg><span className="absolute text-center text-[10px] font-black leading-tight">쾌적<br />지수</span></div></div>
      <div className="mt-5 grid grid-cols-3 gap-2 border-t border-white/20 pt-4"><Metric icon={<Droplets size={16} />} label="습도" value={weather ? `${weather.humidity}%` : "--"} /><Metric icon={<Wind size={16} />} label="바람" value={weather ? `${weather.wind_speed}m/s` : "--"} /><Metric icon={<Umbrella size={16} />} label="강수" value={weather ? `${weather.precipitation_probability ?? 0}%` : "--"} /></div>
      <button disabled={busy} onClick={onRefresh} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-white/15 px-4 py-3 text-xs font-black backdrop-blur disabled:opacity-50"><Sparkles size={15} />{busy ? "개인화 분석 중…" : "최신 날씨로 새로고침"}</button>
    </section>

    {error && <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">{error}</p>}

    <section className="rounded-3xl bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-xs font-black text-blue-600">시간에 따른 체감 변화</p><h2 className="mt-1 font-black text-slate-900">이 계획이라면 언제 움직이면 좋을까요?</h2></div><span className="rounded-xl bg-sky-50 p-2 text-blue-600"><ActivityIcon size={18} /></span></div><div className="mt-4">{activityPlanEditing ? <div className="rounded-2xl bg-sky-50 p-3"><div className="flex items-center justify-between"><div><p className="text-xs font-black text-blue-800">활동 계획 수정</p><p className="mt-1 text-[11px] text-blue-700">선택한 시간대에 맞춰 아래 흐름을 계산합니다.</p></div><button type="button" onClick={() => setActivityPlanEditing(false)} className="rounded-lg bg-white px-2.5 py-2 text-xs font-bold text-slate-600 shadow-sm">취소</button></div><ActivityPlanControls key={`${activityPlan.activity}-${activityPlan.environment}-${activityPlan.startHourIndex}-${activityPlan.durationHours}`} plan={activityPlan} onApply={(plan) => { onApplyActivityPlan(plan); setActivityPlanEditing(false); }} /></div> : <button type="button" aria-expanded={false} onClick={() => setActivityPlanEditing(true)} className="flex w-full items-center gap-3 rounded-2xl bg-sky-50 p-3 text-left"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-blue-600"><ActivityIcon size={17} /></span><span className="min-w-0 flex-1"><span className="block text-xs font-black text-slate-800">{activityLabels[activityPlan.activity]} 계획</span><span className="mt-0.5 block truncate text-[11px] font-medium text-slate-500">{activityPlanSummary} · {forecastChartLabel(activityPlanEndHour)}까지</span></span><span className="shrink-0 text-xs font-black text-blue-700">계획 변경</span></button>}</div>{chartData.length ? <div className="mt-4 h-44"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}><defs><linearGradient id="thermalArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.42} /><stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" /><XAxis dataKey="hour" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#64748b" }} /><YAxis yAxisId="temperature" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#0284c7" }} tickFormatter={(value) => `${value}°`} /><YAxis yAxisId="score" orientation="right" domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#16a34a" }} tickFormatter={(value) => `${value}점`} /><Tooltip contentStyle={{ borderRadius: 14, border: "none", boxShadow: "0 8px 24px rgba(15,23,42,.12)", fontSize: 12 }} /><Area yAxisId="temperature" type="monotone" isAnimationActive={false} dataKey="체감" stroke="#0284c7" strokeWidth={3} fill="url(#thermalArea)" /><Line yAxisId="score" type="monotone" isAnimationActive={false} dataKey="활동점수" stroke="#22c55e" strokeWidth={2} dot={false} /></AreaChart></ResponsiveContainer></div> : <div className="mt-4 flex h-32 flex-col items-center justify-center rounded-2xl bg-slate-50 text-center"><CalendarDays className="text-slate-300" /><p className="mt-2 text-xs font-bold text-slate-500">장소 분석 후 6시간 흐름을 보여드립니다.</p></div>}<div className="mt-2 flex items-center gap-4 text-[10px] font-bold text-slate-500"><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-sky-600" />개인화 체감</span><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-green-500" />활동 적합도</span></div></section>

    <DailyForecastSection items={dailyForecast} loading={dailyForecastLoading} error={dailyForecastError} onRetry={onRefreshDailyForecast} />
    <section className="rounded-3xl bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-indigo-50 text-indigo-600"><Shirt size={20} /></span><div><p className="text-xs font-black text-indigo-600">오늘의 착장</p><h2 className="font-black">{activityLabels[profile.default_activity]}에 맞춘 레이어</h2></div></div><div className="mt-4 flex flex-wrap gap-2">{clothing.map((item) => <span key={item} className="rounded-full bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">{item}</span>)}</div>{recommendation?.nudge?.nudge_warning && <p className="mt-3 rounded-2xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{recommendation.nudge.nudge_message}</p>}{recommendation && <div className="mt-4 border-t border-slate-100 pt-3"><div className="flex items-center justify-between"><p className="text-xs font-bold text-slate-500">이 추천의 실제 느낌은?</p><div className="flex gap-1"><button disabled={busy} onClick={() => onFeedback("too_cold")} className={`rounded-lg px-2 py-1.5 text-[11px] font-bold disabled:opacity-50 ${selectedFeedback === "too_cold" ? "bg-sky-600 text-white" : "bg-sky-50 text-sky-700"}`}>추움</button><button disabled={busy} onClick={() => onFeedback("comfortable")} className={`rounded-lg px-2 py-1.5 text-[11px] font-bold disabled:opacity-50 ${selectedFeedback === "comfortable" ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700"}`}>좋음</button><button disabled={busy} onClick={() => onFeedback("too_hot")} className={`rounded-lg px-2 py-1.5 text-[11px] font-bold disabled:opacity-50 ${selectedFeedback === "too_hot" ? "bg-rose-600 text-white" : "bg-rose-50 text-rose-700"}`}>더움</button></div></div>{feedbackMessage && <p className={`mt-3 rounded-xl p-3 text-xs font-bold ${feedbackMessage.startsWith("저장됨") ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{feedbackMessage}</p>}{recommendation.personalization && <p className="mt-2 text-[11px] text-slate-500">누적 체감 보정 {recommendation.personalization.feedback_warmth_bias > 0 ? "+" : ""}{recommendation.personalization.feedback_warmth_bias.toFixed(1)} · 옷장 {recommendation.personalization.wardrobe_items_used}개 반영</p>}</div>}</section>
    <button onClick={onLocate} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 p-3 text-xs font-bold text-blue-700"><Navigation size={15} />내 현재 위치로 분석</button>
  </div>;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-2xl bg-white/12 p-2 text-center"><span className="mx-auto block w-fit text-sky-100">{icon}</span><p className="mt-1 text-[10px] text-sky-100">{label}</p><p className="mt-0.5 text-xs font-black">{value}</p></div>;
}

function LocationPicker({ current, savedLocations, catalog, onClose, onLocate, onSelect, onSaveCurrent }: { current: SelectedLocation; savedLocations: SavedLocation[]; catalog: LocationOption[]; onClose: () => void; onLocate: () => void; onSelect: (location: LocationOption | SavedLocation) => void; onSaveCurrent: () => void }) {
  const [query, setQuery] = useState("");
  const filtered = catalog.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 30);
  return <div className="fixed inset-0 z-50 flex items-end bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-5"><div className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-[30px] bg-[#f7faff] p-5 shadow-2xl sm:rounded-[30px]"><div className="flex items-start justify-between"><div><p className="text-xs font-black text-blue-600">WEATHER LOCATION</p><h2 className="mt-1 text-xl font-black">어디의 날씨를 분석할까요?</h2><p className="mt-1 text-xs text-slate-500">선택한 장소의 기후와 내 프로필을 함께 반영합니다.</p></div><button aria-label="닫기" onClick={onClose} className="rounded-full bg-slate-100 p-2 text-slate-600"><X size={18} /></button></div><div className="mt-5 flex gap-2"><button onClick={onLocate} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 p-3 text-xs font-black text-white"><Navigation size={15} />현재 위치</button><button onClick={onSaveCurrent} className="flex items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-white px-4 text-xs font-bold text-blue-700"><Plus size={15} />저장</button></div><div className="mt-4 flex items-center gap-2 rounded-2xl bg-white px-3 py-3 ring-1 ring-slate-100"><Search size={17} className="text-slate-400" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="지역명으로 찾기 (예: 강남, 수원)" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" /></div><div className="mt-5"><div className="flex items-center justify-between"><h3 className="text-xs font-black text-slate-500">현재 선택</h3><span className="text-[11px] text-slate-400">{current.latitude.toFixed(3)}, {current.longitude.toFixed(3)}</span></div><div className="mt-2 flex items-center gap-3 rounded-2xl bg-sky-100 p-3 text-blue-900"><span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-blue-600"><MapPin size={18} /></span><p className="text-sm font-black">{current.label}</p><Check size={17} className="ml-auto text-blue-600" /></div></div>{savedLocations.length > 0 && <div className="mt-5"><h3 className="text-xs font-black text-slate-500">저장한 장소</h3><div className="mt-2 grid gap-2">{savedLocations.map((item) => <LocationRow key={item.id} item={item} onSelect={onSelect} />)}</div></div>}<div className="mt-5"><h3 className="text-xs font-black text-slate-500">분석 가능한 지역</h3><div className="mt-2 grid gap-2">{filtered.length ? filtered.map((item) => <LocationRow key={item.id} item={item} onSelect={onSelect} />) : <p className="rounded-2xl bg-white p-4 text-center text-xs text-slate-500">검색 결과가 없습니다.</p>}</div></div></div></div>;
}

function ActivityPlanControls({ plan, onApply }: { plan: ActivityPlan; onApply: (plan: ActivityPlan) => void }) {
  const [draft, setDraft] = useState(plan);
  const startOptions = Array.from({ length: 24 }, (_, index) => new Date().getHours() + index);
  const endHour = draft.startHourIndex + draft.durationHours - 1;

  return <div className="mt-3"><div className="grid grid-cols-2 gap-2"><label className="text-xs font-bold text-slate-600">활동<select value={draft.activity} onChange={(event) => setDraft((current) => ({ ...current, activity: event.target.value as Activity }))} className="mt-1 w-full rounded-xl bg-white px-3 py-2 text-sm text-slate-800">{Object.entries(activityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-xs font-bold text-slate-600">환경<select value={draft.environment} onChange={(event) => setDraft((current) => ({ ...current, environment: event.target.value as Environment }))} className="mt-1 w-full rounded-xl bg-white px-3 py-2 text-sm text-slate-800">{Object.entries(environmentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-xs font-bold text-slate-600">시작<select value={draft.startHourIndex} onChange={(event) => setDraft((current) => ({ ...current, startHourIndex: Number(event.target.value) }))} className="mt-1 w-full rounded-xl bg-white px-3 py-2 text-sm text-slate-800">{startOptions.map((hour) => <option key={hour} value={hour}>{forecastChartLabel(hour)}</option>)}</select></label><label className="text-xs font-bold text-slate-600">기간<select value={draft.durationHours} onChange={(event) => setDraft((current) => ({ ...current, durationHours: Number(event.target.value) }))} className="mt-1 w-full rounded-xl bg-white px-3 py-2 text-sm text-slate-800">{[1, 2, 3, 4, 6].map((hours) => <option key={hours} value={hours}>{hours}시간</option>)}</select></label></div><div className="mt-3 flex items-center justify-between rounded-xl bg-white px-3 py-2"><p className="text-xs font-bold text-blue-800">{forecastChartLabel(draft.startHourIndex)} ~ {forecastChartLabel(endHour)}</p><button type="button" onClick={() => onApply(draft)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-black text-white">이 계획으로 보기</button></div></div>;
}

function DailyForecastSection({ items, loading, error, onRetry }: { items: DailyForecast[]; loading: boolean; error: string | null; onRetry: () => void }) {
  const dayLabel = (date: string, index: number) => {
    if (index === 0) return "오늘";
    if (index === 1) return "내일";
    const parsed = new Date(`${date}T00:00:00`);
    return new Intl.DateTimeFormat("ko-KR", { weekday: "short" }).format(parsed);
  };

  return <section className="rounded-3xl bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between"><div><p className="text-xs font-black text-blue-600">7일 날씨</p><h2 className="mt-1 font-black text-slate-900">날짜별 예보</h2></div><CloudSun className="text-sky-500" size={21} /></div>
    {items.length ? <div className="mt-4 flex gap-2 overflow-x-auto pb-1">{items.map((item, index) => <article key={item.date} className="min-w-28 flex-1 rounded-2xl bg-sky-50 p-3 text-center"><p className="text-xs font-black text-slate-800">{dayLabel(item.date, index)}</p><p className="mt-1 text-[10px] text-slate-500">{item.date.slice(5).replace("-", ".")}</p><p className="mt-3 text-sm font-black text-slate-900"><span className="text-sky-600">{Math.round(item.temperature_min)}°</span> <span className="text-slate-400">/</span> <span className="text-rose-500">{Math.round(item.temperature_max)}°</span></p><div className="mt-3 space-y-1 text-[10px] font-bold text-slate-600"><p>강수 {item.precipitation_probability_max}%</p><p>평균 습도 {item.humidity_avg ?? "-"}%</p></div></article>)}</div> : <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-center text-xs font-bold text-slate-500">{loading ? "날짜별 예보를 준비하고 있습니다." : error ? <><p>{error}</p><button onClick={onRetry} className="mt-3 rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white">다시 시도</button></> : "날짜별 예보가 없습니다."}</div>}
    <p className="mt-3 text-[10px] text-slate-400">최저/최고기온 · 일 최대 강수확률 · 평균 습도</p>
  </section>;
}

function LocationRow({ item, onSelect }: { item: LocationOption | SavedLocation; onSelect: (location: LocationOption | SavedLocation) => void }) {
  return <button onClick={() => onSelect(item)} className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:ring-blue-200"><span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-600"><MapPin size={17} /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-800">{item.name}</span><span className="mt-0.5 block text-[11px] text-slate-500">{item.latitude.toFixed(3)}, {item.longitude.toFixed(3)}</span></span><ChevronRight size={16} className="text-slate-400" /></button>;
}

function HourlyTab({ location, forecastDays, forecastLoading, forecastError, onRefreshForecast, activity, recommendations, error }: { location: SelectedLocation; forecastDays: DailyForecast[]; forecastLoading: boolean; forecastError: string | null; onRefreshForecast: () => void; activity: Activity; recommendations: Record<number, Recommendation>; error: string | null }) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [hourlyWeather, setHourlyWeather] = useState<HourlyForecast[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const selectedDateIsAvailable = selectedDate !== null && forecastDays.some((day) => day.date === selectedDate);
  const activeDate = selectedDateIsAvailable ? selectedDate : forecastDays[0]?.date ?? null;

  useEffect(() => {
    if (!activeDate) return;
    let cancelled = false;
    const controller = new AbortController();

    async function loadHourlyWeather() {
      setLoadingDetail(true);
      setDetailError(null);
      const params = new URLSearchParams({ latitude: String(location.latitude), longitude: String(location.longitude), date: activeDate });
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/weather/hourly?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`상세 예보를 불러오지 못했습니다. (${response.status})`);
        const data = await response.json() as { hourly: HourlyForecast[] };
        if (!cancelled) setHourlyWeather(data.hourly);
      } catch (fetchError) {
        if (!cancelled && !(fetchError instanceof DOMException && fetchError.name === "AbortError")) {
          setDetailError(formatError(fetchError, "상세 예보를 불러오지 못했습니다."));
        }
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    }

    void loadHourlyWeather();
    return () => { cancelled = true; controller.abort(); };
  }, [activeDate, location.latitude, location.longitude]);

  const dayLabel = (date: string, index: number) => index === 0 ? "오늘" : index === 1 ? "내일" : new Intl.DateTimeFormat("ko-KR", { weekday: "short" }).format(new Date(`${date}T00:00:00`));
  const activityName = activityLabels[activity];
  const activityKey = activity === "running" ? "러닝" : activity === "cycling" ? "라이딩" : "산책";
  const actionSummary = (hour: HourlyForecast) => hour.precipitation_probability >= 60 ? "우산 챙기기" : (hour.wind_speed ?? 0) >= 8 ? "강한 바람 주의" : hour.apparent_temperature >= 28 ? "수분 보충하기" : hour.apparent_temperature <= 5 ? "따뜻하게 입기" : "야외 활동 무난";
  const initialHours = Object.keys(recommendations).map(Number).sort((left, right) => left - right);
  const bestScore = initialHours.map((hour) => recommendations[hour]?.suitability?.find((score) => score.name.includes(activityKey))?.score ?? 0).reduce((best, score) => Math.max(best, score), 0);

  return <div className="space-y-4">
    <section className="rounded-[28px] bg-[linear-gradient(135deg,#1b8bd6,#2a4cb4)] p-5 text-white shadow-lg">
      <p className="text-sm font-bold text-sky-100">상세 예보</p><h1 className="mt-1 text-2xl font-black">언제 나갈지 계획해 보세요</h1><p className="mt-2 text-sm text-sky-100">날짜를 고르면 시간별 기온, 체감, 비, 습도와 바람을 확인할 수 있어요.</p>
      <div className="mt-4 rounded-2xl bg-white/10 px-4 py-3 text-xs font-bold text-sky-50">현재 {activityName} 기준 다음 시간대 활동 적합도 최고 {bestScore || "--"}점</div>
    </section>
    <section className="rounded-3xl bg-white p-4 shadow-sm">
      <p className="px-1 text-xs font-black text-slate-600">날짜 선택</p>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{forecastDays.map((day, index) => <button key={day.date} onClick={() => setSelectedDate(day.date)} className={`min-w-20 rounded-2xl px-3 py-2 text-center text-xs font-bold ${activeDate === day.date ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}><span className="block">{dayLabel(day.date, index)}</span><span className="mt-1 block text-[10px] opacity-80">{day.date.slice(5).replace("-", ".")}</span></button>)}</div>
      {!forecastDays.length && <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs font-bold text-slate-600"><p>{forecastLoading ? "날짜별 예보를 준비하고 있습니다." : forecastError ?? "날짜별 예보가 없습니다."}</p>{!forecastLoading && <button onClick={onRefreshForecast} className="mt-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-black text-white">예보 다시 불러오기</button>}</div>}
    </section>
    {error && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{error}</p>}
    {detailError && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{detailError}</p>}
    <section className="rounded-3xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between px-1"><div><p className="text-xs font-black text-blue-600">시간별 조건</p><h2 className="mt-1 font-black text-slate-900">{activeDate ?? "날짜 선택"}</h2></div></div>
      {loadingDetail ? <div className="mt-4 rounded-2xl bg-slate-50 p-6 text-center text-xs font-bold text-slate-500">시간별 예보를 준비하고 있습니다.</div> : <div className="mt-4 divide-y divide-slate-100 rounded-2xl bg-slate-50 px-3">{hourlyWeather.map((hour) => <article key={hour.time} className="flex min-h-20 items-center gap-3 py-3 first:pt-2 last:pb-2"><time className="w-11 shrink-0 text-sm font-black text-slate-800">{hour.time.slice(11, 16)}</time><div className="w-12 shrink-0"><p className="text-lg font-black leading-none text-slate-900">{Math.round(hour.temperature)}°</p><p className="mt-1 whitespace-nowrap text-[10px] font-bold text-sky-700">체감 {Math.round(hour.apparent_temperature)}°</p></div><div className="min-w-0 flex-1"><p className="truncate text-xs font-black text-slate-700">{actionSummary(hour)}</p><div className="mt-1 flex flex-wrap gap-x-2 text-[10px] font-bold text-slate-500"><span>습도 {hour.humidity ?? "-"}%</span><span>바람 {hour.wind_speed ?? "-"}m/s</span><span>야외 {hour.utci === null ? "-" : `${Math.round(hour.utci)}°`}</span></div></div><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${hour.precipitation_probability >= 50 ? "bg-blue-100 text-blue-700" : "bg-white text-slate-500"}`}>비 {Math.round(hour.precipitation_probability)}%</span></article>)}</div>}
      {!loadingDetail && !hourlyWeather.length && !detailError && <div className="mt-4 rounded-2xl bg-slate-50 p-6 text-center text-xs font-bold text-slate-500">선택한 날짜의 시간별 예보가 없습니다.</div>}
    </section>
  </div>;
}

function ClothingTab({ user, items, busy, message, onAdd, onUpdate, onDelete, onLogin }: { user: User | null; items: WardrobeItem[]; busy: boolean; message: string | null; onAdd: (item: Omit<WardrobeItem, "id">) => Promise<void>; onUpdate: (itemId: string, item: Omit<WardrobeItem, "id">) => Promise<void>; onDelete: (itemId: string) => Promise<void>; onLogin: () => void }) {
  const categories: Record<WardrobeItem["category"], string> = { top: "상의", bottom: "하의", outerwear: "아우터", shoes: "신발", accessory: "소품", other: "기타" };
  const seasonLabels: Record<WardrobeItem["seasons"][number], string> = { spring: "봄", summer: "여름", fall: "가을", winter: "겨울" };
  const presets = [{ label: "반팔 티셔츠", category: "top", warmth: -1 }, { label: "셔츠·블라우스", category: "top", warmth: 0 }, { label: "니트·스웨터", category: "top", warmth: 1 }, { label: "청바지", category: "bottom", warmth: 0 }, { label: "기모 바지", category: "bottom", warmth: 1 }, { label: "바람막이", category: "outerwear", warmth: 0 }, { label: "코트·패딩", category: "outerwear", warmth: 2 }, { label: "운동화", category: "shoes", warmth: 0 }, { label: "모자·장갑", category: "accessory", warmth: 1 } ] as const;
  const materials = [{ label: "면", adjustment: 0 }, { label: "린넨", adjustment: -1 }, { label: "폴리에스터", adjustment: 0 }, { label: "울", adjustment: 1 }, { label: "캐시미어", adjustment: 2 }, { label: "플리스", adjustment: 1 }, { label: "다운", adjustment: 2 }, { label: "혼방", adjustment: 0 }];
  const [name, setName] = useState(""); const [subcategory, setSubcategory] = useState(""); const [category, setCategory] = useState<WardrobeItem["category"]>("top"); const [material, setMaterial] = useState("면"); const [warmth, setWarmth] = useState(0); const [notes, setNotes] = useState(""); const [waterResistant, setWaterResistant] = useState(false); const [favorite, setFavorite] = useState(false); const [seasons, setSeasons] = useState<WardrobeItem["seasons"]>(["spring", "summer", "fall", "winter"]); const [inLaundry, setInLaundry] = useState(false); const [editingId, setEditingId] = useState<string | null>(null); const [query, setQuery] = useState(""); const [filterCategory, setFilterCategory] = useState<"all" | WardrobeItem["category"]>("all"); const [availability, setAvailability] = useState<"all" | "available" | "laundry" | "favorite">("all");
  const selectedMaterial = materials.find((item) => item.label === material) ?? materials[0];
  const toggleSeason = (season: WardrobeItem["seasons"][number]) => setSeasons((selected) => selected.includes(season) ? selected.filter((item) => item !== season) : [...selected, season]);
  const resetForm = () => { setName(""); setSubcategory(""); setCategory("top"); setMaterial("면"); setWarmth(0); setNotes(""); setWaterResistant(false); setFavorite(false); setSeasons(["spring", "summer", "fall", "winter"]); setInLaundry(false); setEditingId(null); };
  const choosePreset = (label: string) => { const preset = presets.find((item) => item.label === label); if (!preset) return; setSubcategory(preset.label); setName(preset.label); setCategory(preset.category); setWarmth(Math.max(-2, Math.min(2, preset.warmth + selectedMaterial.adjustment))); };
  const beginEdit = (item: WardrobeItem) => { setEditingId(item.id); setName(item.name); setSubcategory(item.subcategory ?? ""); setCategory(item.category); setMaterial(item.material ?? "면"); setWarmth(item.warmth_level); setNotes(item.notes ?? ""); setWaterResistant(item.water_resistant); setFavorite(item.is_favorite); setSeasons(item.seasons ?? []); setInLaundry(item.is_in_laundry); };
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!name.trim() || seasons.length === 0) return; const payload = { name: name.trim(), category, subcategory: subcategory || null, material: material || null, notes: notes.trim() || null, warmth_level: warmth, water_resistant: waterResistant, is_favorite: favorite, seasons, is_in_laundry: inLaundry }; if (editingId) await onUpdate(editingId, payload); else await onAdd(payload); resetForm(); }
  const filteredItems = items.filter((item) => (filterCategory === "all" || item.category === filterCategory) && (availability === "all" || availability === "available" && !item.is_in_laundry || availability === "laundry" && item.is_in_laundry || availability === "favorite" && item.is_favorite) && `${item.name} ${item.subcategory ?? ""} ${item.material ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  if (!user) return <div className="space-y-4"><section className="rounded-[28px] bg-[linear-gradient(135deg,#1b8bd6,#2a4cb4)] p-5 text-white shadow-lg"><p className="text-sm font-bold text-sky-100">내 옷장</p><h1 className="mt-1 text-2xl font-black">내 옷으로 추천받기</h1><p className="mt-2 text-sm text-sky-100">자주 입는 옷을 등록하면 오늘의 착장이 더 정확해져요.</p></section><div className="rounded-3xl border border-dashed border-sky-300 bg-sky-50 p-6 text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white text-sky-500 shadow-sm"><Shirt size={28} /></span><p className="mt-3 text-sm font-bold text-slate-700">로그인 후 나만의 옷장을 만들 수 있습니다.</p><button onClick={onLogin} className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white">로그인하기</button></div></div>;
  return <div className="space-y-4"><section className="rounded-[28px] bg-[linear-gradient(135deg,#1b8bd6,#2a4cb4)] p-5 text-white shadow-lg"><div className="flex items-start justify-between"><div><p className="text-sm font-bold text-sky-100">내 옷장</p><h1 className="mt-1 text-2xl font-black">내 옷으로 추천받기</h1><p className="mt-2 text-sm text-sky-100">소재와 두께를 함께 기록해 더 정확한 보온성을 반영해요.</p></div><span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15"><Shirt size={23} /></span></div><p className="mt-4 text-xs font-bold text-sky-100">등록한 옷 {items.length}벌 · 현재 조회 {filteredItems.length}벌</p></section><form onSubmit={submit} className="space-y-3 rounded-3xl bg-white p-4 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-sm font-black text-slate-800">{editingId ? "옷 정보 수정" : "새 옷 추가"}</p><p className="mt-1 text-xs text-slate-500">의류와 소재를 선택하면 보온 점수를 제안해요.</p></div>{editingId && <button type="button" onClick={resetForm} className="rounded-lg bg-slate-100 p-2 text-slate-500"><X size={15} /></button>}</div><label className="block text-xs font-bold text-slate-600">의류 종류<select value={subcategory} onChange={(event) => choosePreset(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value="">직접 입력</option>{presets.map((preset) => <option key={preset.label} value={preset.label}>{preset.label}</option>)}</select></label><div className="grid grid-cols-2 gap-2"><label className="block text-xs font-bold text-slate-600">소재<select value={material} onChange={(event) => { setMaterial(event.target.value); const next = materials.find((item) => item.label === event.target.value); if (subcategory) { const preset = presets.find((item) => item.label === subcategory); if (preset && next) setWarmth(Math.max(-2, Math.min(2, preset.warmth + next.adjustment))); } }} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">{materials.map((item) => <option key={item.label} value={item.label}>{item.label}</option>)}</select></label><label className="block text-xs font-bold text-slate-600">추천 보온성<select value={warmth} onChange={(event) => setWarmth(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"><option value={-2}>아주 얇음</option><option value={-1}>얇음</option><option value={0}>보통</option><option value={1}>따뜻함</option><option value={2}>매우 따뜻함</option></select></label></div><input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="옷 이름 (예: 출근용 바람막이)" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /><textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={240} rows={2} placeholder="두께, 안감, 착용감 등 메모 (선택)" className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm" /><div className="grid grid-cols-2 gap-2 text-xs text-slate-600"><label className="flex items-center gap-2"><input type="checkbox" checked={waterResistant} onChange={(event) => setWaterResistant(event.target.checked)} /> 방수/발수 가능</label><label className="flex items-center gap-2"><input type="checkbox" checked={favorite} onChange={(event) => setFavorite(event.target.checked)} /> 즐겨 입음</label><label className="flex items-center gap-2"><input type="checkbox" checked={inLaundry} onChange={(event) => setInLaundry(event.target.checked)} /> 세탁 중</label></div><div><p className="text-xs font-bold text-slate-600">사용 계절</p><div className="mt-2 grid grid-cols-4 gap-1">{Object.entries(seasonLabels).map(([season, label]) => <label key={season} className="flex items-center justify-center gap-1 text-[11px] text-slate-600"><input type="checkbox" checked={seasons.includes(season as WardrobeItem["seasons"][number])} onChange={() => toggleSeason(season as WardrobeItem["seasons"][number])} />{label}</label>)}</div></div><button disabled={busy || !name.trim() || seasons.length === 0} className="flex w-full items-center justify-center gap-1 rounded-xl bg-blue-600 px-4 py-3 text-xs font-bold text-white disabled:opacity-50">{editingId ? <Check size={14} /> : <Plus size={14} />}{editingId ? "수정 저장" : "옷장에 추가"}</button></form>{message && <p className="rounded-xl bg-sky-50 p-3 text-xs text-sky-800">{message}</p>}<section className="space-y-3"><div className="flex items-center justify-between px-1"><h2 className="text-sm font-black">등록한 옷</h2><span className="text-xs font-bold text-slate-400">{filteredItems.length}벌</span></div><div className="rounded-2xl bg-white p-3 shadow-sm"><label className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2"><Search size={15} className="text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="옷 이름 또는 소재 검색" className="w-full bg-transparent text-sm outline-none" /></label><div className="mt-2 flex gap-2 overflow-x-auto pb-1">{(["all", ...Object.keys(categories)] as ("all" | WardrobeItem["category"])[]).map((value) => <button type="button" key={value} onClick={() => setFilterCategory(value)} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold ${filterCategory === value ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}>{value === "all" ? "전체" : categories[value]}</button>)}</div><div className="mt-2 flex gap-2 overflow-x-auto">{(["all", "available", "favorite", "laundry"] as const).map((value) => <button type="button" key={value} onClick={() => setAvailability(value)} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold ${availability === value ? "bg-sky-100 text-blue-700" : "bg-slate-50 text-slate-500"}`}>{{ all: "모든 상태", available: "착용 가능", favorite: "즐겨 입음", laundry: "세탁 중" }[value]}</button>)}</div></div>{filteredItems.length === 0 ? <p className="rounded-2xl bg-slate-50 p-4 text-center text-sm text-slate-500">조건에 맞는 옷이 없습니다.</p> : filteredItems.map((item) => <div key={item.id} className="flex items-start justify-between rounded-2xl bg-white p-4 shadow-sm"><button type="button" onClick={() => beginEdit(item)} className="min-w-0 flex-1 text-left"><p className="text-sm font-bold">{item.is_favorite ? "★ " : ""}{item.name}{item.is_in_laundry ? " · 세탁 중" : ""}</p><p className="mt-1 text-xs text-slate-500">{categories[item.category]} · {item.subcategory ?? "직접 입력"} · {item.material ?? "소재 미입력"} · 보온 {item.warmth_level > 0 ? `+${item.warmth_level}` : item.warmth_level}</p>{item.notes && <p className="mt-1 truncate text-xs text-slate-400">{item.notes}</p>}</button><div className="ml-2 flex"><button type="button" aria-label={`${item.name} 수정`} onClick={() => beginEdit(item)} className="rounded-lg p-2 text-blue-500 hover:bg-sky-50"><Settings size={16} /></button><button aria-label={`${item.name} 삭제`} disabled={busy} onClick={() => void onDelete(item.id)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-500"><Trash2 size={16} /></button></div></div>)}</section></div>;
}

function SettingsTab({ user, profile, setProfile, busy, message, onLoad, onSave, onLogin, onSignOutLocal, onSignOutAll, onEmailChange, onPasswordChange, onFeedbackReset, onDeletionRequest, onDeletionCancel, location, savedLocations, onLoadLocations, onSaveLocation, onSelectLocation, onDeleteLocation }: { user: User | null; profile: UserProfile; setProfile: (profile: UserProfile) => void; busy: boolean; message: string | null; onLoad: () => void; onSave: () => void; onLogin: () => void; onSignOutLocal: () => void; onSignOutAll: () => void; onEmailChange: (email: string) => Promise<void>; onPasswordChange: (password: string) => Promise<void>; onFeedbackReset: () => Promise<void>; onDeletionRequest: (phrase: string) => Promise<void>; onDeletionCancel: () => Promise<void>; location: { label: string }; savedLocations: SavedLocation[]; onLoadLocations: () => Promise<void>; onSaveLocation: () => Promise<void>; onSelectLocation: (location: SavedLocation) => void; onDeleteLocation: (locationId: string) => Promise<void> }) {
  const update = <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => setProfile({ ...profile, [key]: value });
  const [nextEmail, setNextEmail] = useState(user?.email ?? "");
  const [nextPassword, setNextPassword] = useState("");
  const [deletePhrase, setDeletePhrase] = useState("");

  if (!user) return <div className="space-y-4"><section className="rounded-[28px] bg-[linear-gradient(135deg,#1b8bd6,#2a4cb4)] p-5 text-white shadow-lg"><p className="text-sm font-bold text-sky-100">개인화 설정</p><h1 className="mt-1 text-2xl font-black">내 체감에 맞춰 볼까요?</h1><p className="mt-2 text-sm text-sky-100">신체 정보와 활동 선호를 저장하면 추천이 더 나에게 맞아져요.</p></section><button onClick={onLogin} className="w-full rounded-2xl bg-blue-600 p-4 text-sm font-bold text-white shadow-sm">로그인 또는 회원가입</button></div>;

  return <div className="space-y-4">
    <section className="rounded-[28px] bg-[linear-gradient(135deg,#1b8bd6,#2a4cb4)] p-5 text-white shadow-lg"><div className="flex items-start justify-between"><div><p className="text-sm font-bold text-sky-100">계정 및 개인화</p><h1 className="mt-1 max-w-72 truncate text-xl font-black">{user.email}</h1><p className="mt-2 text-sm text-sky-100">추천에 반영할 정보를 관리하세요.</p></div><span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15"><UserRound size={22} /></span></div></section>
    <div className="flex gap-2"><button onClick={onLoad} disabled={busy} className="flex-1 rounded-xl border border-slate-200 bg-white p-3 text-xs font-bold shadow-sm">저장 정보 불러오기</button><button onClick={onSignOutLocal} className="rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-500 shadow-sm">이 기기 로그아웃</button></div>
    {message && <p className="rounded-xl bg-sky-50 p-3 text-xs text-sky-800">{message}</p>}
    <section className="space-y-3 rounded-3xl bg-white p-5 shadow-sm"><h2 className="font-black">로그인 정보</h2><Field label="변경할 이메일" value={nextEmail} onChange={setNextEmail} type="text" /><button onClick={() => void onEmailChange(nextEmail)} disabled={busy || !nextEmail} className="w-full rounded-xl border border-blue-200 p-3 text-xs font-bold text-blue-700 disabled:opacity-50">이메일 변경 요청</button><label className="block text-xs font-bold text-slate-600">새 비밀번호<input minLength={8} type="password" value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm" /></label><button onClick={() => { void onPasswordChange(nextPassword); setNextPassword(""); }} disabled={busy || nextPassword.length < 8} className="w-full rounded-xl border border-blue-200 p-3 text-xs font-bold text-blue-700 disabled:opacity-50">비밀번호 변경</button><button onClick={onSignOutAll} disabled={busy} className="w-full rounded-xl border border-slate-200 p-3 text-xs font-bold text-slate-600 disabled:opacity-50">모든 기기 로그아웃</button></section>
    <section className="space-y-3 rounded-3xl bg-white p-5 shadow-sm"><h2 className="font-black">선택 개인화 정보</h2><p className="text-xs text-slate-500">입력하지 않아도 일반 추천을 사용할 수 있습니다.</p><div className="grid grid-cols-2 gap-3"><Field label="키 (cm)" value={profile.height_cm} onChange={(value) => update("height_cm", value)} type="number" /><Field label="몸무게 (kg)" value={profile.weight_kg} onChange={(value) => update("weight_kg", value)} type="number" /><Field label="체지방률 (%)" value={profile.body_fat_pct} onChange={(value) => update("body_fat_pct", value)} type="number" /><Field label="출생 연도" value={profile.birth_year} onChange={(value) => update("birth_year", value)} type="number" /></div><label className="block text-xs font-bold text-slate-600">성별(선택)<select value={profile.sex} onChange={(event) => update("sex", event.target.value as Sex)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm"><option value="undisclosed">응답 안 함</option><option value="female">여성</option><option value="male">남성</option></select></label></section>
    <section className="space-y-3 rounded-3xl bg-white p-5 shadow-sm"><h2 className="font-black">활동과 환경</h2><label className="block text-xs font-bold text-slate-600">기본 활동<select value={profile.default_activity} onChange={(event) => update("default_activity", event.target.value as Activity)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm">{Object.entries(activityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="block text-xs font-bold text-slate-600">환경<select value={profile.default_environment} onChange={(event) => update("default_environment", event.target.value as Environment)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm">{Object.entries(environmentLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>{profile.default_environment !== "outdoor" && <Field label="실내 온도 (°C)" value={profile.indoor_temperature_c} onChange={(value) => update("indoor_temperature_c", value)} type="number" />}<label className="block text-xs font-bold text-slate-600">추위/더위 민감도<div className="mt-2 flex items-center gap-3"><input type="range" min="-2" max="2" step="1" value={profile.thermal_sensitivity} onChange={(event) => update("thermal_sensitivity", Number(event.target.value))} className="flex-1 accent-blue-600" /><span className="w-14 text-center text-xs font-black">{profile.thermal_sensitivity > 0 ? `더위 +${profile.thermal_sensitivity}` : profile.thermal_sensitivity < 0 ? `추위 ${profile.thermal_sensitivity}` : "보통"}</span></div></label></section>
    <button onClick={onSave} disabled={busy} className="w-full rounded-2xl bg-blue-600 p-4 text-sm font-black text-white disabled:opacity-50">{busy ? "저장 중…" : "개인화 프로필 저장"}</button>
    <section className="space-y-3 rounded-3xl bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-black">즐겨찾는 장소</h2><button onClick={() => void onLoadLocations()} disabled={busy} className="text-xs font-bold text-blue-600">새로고침</button></div><p className="text-xs text-slate-500">현재 위치: {location.label}</p><button onClick={() => void onSaveLocation()} disabled={busy} className="w-full rounded-xl border border-blue-200 p-3 text-xs font-bold text-blue-700 disabled:opacity-50">현재 장소 저장</button><div className="space-y-2">{savedLocations.length === 0 ? <p className="text-center text-xs text-slate-400">저장된 장소가 없습니다.</p> : savedLocations.map((item) => <div key={item.id} className="flex items-center gap-2 rounded-xl bg-slate-50 p-3"><button onClick={() => onSelectLocation(item)} className="min-w-0 flex-1 text-left"><p className="truncate text-sm font-bold">{item.name}</p><p className="text-[11px] text-slate-500">{item.latitude.toFixed(3)}, {item.longitude.toFixed(3)}</p></button><button aria-label={`${item.name} 삭제`} onClick={() => void onDeleteLocation(item.id)} disabled={busy} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-500"><Trash2 size={15} /></button></div>)}</div></section>
    <section className="space-y-3 rounded-3xl border border-rose-200 bg-rose-50 p-5"><h2 className="font-black text-rose-800">데이터와 계정 삭제</h2><button onClick={() => void onFeedbackReset()} disabled={busy} className="w-full rounded-xl border border-rose-200 bg-white p-3 text-xs font-bold text-rose-700 disabled:opacity-50">누적 착용감 피드백 초기화</button><p className="text-xs text-rose-700">탈퇴 요청 후 30일 동안 취소할 수 있습니다. 요청 전 다시 로그인해야 하며, 아래에 DELETE를 입력하세요.</p><Field label="확인 문구" value={deletePhrase} onChange={setDeletePhrase} type="text" /><button onClick={() => void onDeletionRequest(deletePhrase)} disabled={busy || deletePhrase !== "DELETE"} className="w-full rounded-xl bg-rose-600 p-3 text-xs font-bold text-white disabled:opacity-50">30일 후 계정 삭제 요청</button><button onClick={() => void onDeletionCancel()} disabled={busy} className="w-full rounded-xl border border-rose-300 bg-white p-3 text-xs font-bold text-rose-700 disabled:opacity-50">탈퇴 요청 취소</button></section>
  </div>;
}

function Field({ label, value, onChange, type }: { label: string; value: string; onChange: (value: string) => void; type: "number" | "text" }) {
  return <label className="block text-xs font-bold text-slate-600">{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm" /></label>;
}

function AuthModal({ mode, email, password, terms, privacy, marketing, busy, message, error, onClose, onModeChange, onEmailChange, onPasswordChange, onTermsChange, onPrivacyChange, onMarketingChange, onSubmit, onGoogle, onReset }: { mode: "signIn" | "signUp"; email: string; password: string; terms: boolean; privacy: boolean; marketing: boolean; busy: boolean; message: string | null; error: string | null; onClose: () => void; onModeChange: (mode: "signIn" | "signUp") => void; onEmailChange: (email: string) => void; onPasswordChange: (password: string) => void; onTermsChange: (value: boolean) => void; onPrivacyChange: (value: boolean) => void; onMarketingChange: (value: boolean) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onGoogle: () => void; onReset: () => void }) {
  const isSignUp = mode === "signUp";
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-5 backdrop-blur-sm"><div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-sm font-black text-blue-600">THERMAL GUIDE</p><h2 className="mt-1 text-xl font-black">{isSignUp ? "계정 만들기" : "로그인"}</h2></div><button onClick={onClose} className="rounded-full bg-slate-100 px-3 py-1 text-sm">×</button></div>{error && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}{message && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700">{message}</p>}<form onSubmit={onSubmit} className="mt-5 space-y-3"><Field label="이메일" value={email} onChange={onEmailChange} type="text" /><label className="block text-xs font-bold text-slate-600">비밀번호<input required minLength={8} type="password" value={password} onChange={(event) => onPasswordChange(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm" /></label>{isSignUp && <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-xs"><label className="flex gap-2"><input type="checkbox" checked={terms} onChange={(event) => onTermsChange(event.target.checked)} />[필수] 이용약관 동의</label><label className="flex gap-2"><input type="checkbox" checked={privacy} onChange={(event) => onPrivacyChange(event.target.checked)} />[필수] 개인정보 처리방침 동의</label><label className="flex gap-2"><input type="checkbox" checked={marketing} onChange={(event) => onMarketingChange(event.target.checked)} />[선택] 제품 소식 수신</label></div>}<button disabled={busy} className="w-full rounded-xl bg-blue-600 p-3 text-sm font-black text-white disabled:opacity-50">{isSignUp ? "이메일로 회원가입" : "로그인"}</button></form><button onClick={onGoogle} className="mt-3 w-full rounded-xl border border-slate-200 p-3 text-sm font-bold">Google로 계속하기</button>{!isSignUp && <button onClick={onReset} className="mt-3 w-full text-xs font-bold text-blue-600">비밀번호를 잊으셨나요?</button>}<button onClick={() => onModeChange(isSignUp ? "signIn" : "signUp")} className="mt-5 w-full text-xs font-bold text-slate-500">{isSignUp ? "이미 계정이 있으신가요? 로그인" : "계정이 없으신가요? 회원가입"}</button></div></div>;
}
