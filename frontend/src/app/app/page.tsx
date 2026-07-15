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
  utci: number;
  utci_personalized: number;
  thermal_sensation: string;
  weather?: { temperature: number; humidity: number; wind_speed: number; precipitation_probability?: number };
  recommendations: { clothing: string[]; hydration: string; activity: string };
  nudge?: { nudge_warning: boolean; nudge_message: string };
  suitability?: { name: string; score: number }[];
  personalization?: { wardrobe_items_used: number; feedback_warmth_bias: number; target_warmth_level: number; current_season: string };
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
      setSaveMessage("개인화 프로필을 저장했습니다. 다음 추천부터 반영됩니다.");
    } catch (error) {
      setSaveMessage(formatError(error, "프로필을 저장하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }

  async function requestRecommendation(selectedHour?: number, targetLocation: SelectedLocation = location) {
      const currentYear = new Date().getFullYear();
      const age = profile.birth_year ? Math.max(14, currentYear - Number(profile.birth_year)) : 30;
      const legacyActivity = profile.default_activity === "commute" ? "walking" : profile.default_activity === "outdoor_work" ? "cycling" : profile.default_activity === "indoor_exercise" ? "sedentary" : profile.default_activity;
      const response = await fetch(`${API_BASE_URL}${session ? "/api/v1/recommendations" : "/api/v1/recommend"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({
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
            environment: profile.default_environment === "indoor" ? "indoor" : "outdoor",
            activity_level: legacyActivity,
          },
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { detail?: string } | null;
        if (response.status === 401) throw new Error("로그인 세션이 만료되었습니다. 다시 로그인해 주세요.");
        throw new Error(payload?.detail || `날씨 분석을 불러오지 못했습니다. (${response.status})`);
      }
      return await response.json() as Recommendation;
  }

  async function loadRecommendation() {
    setBusy(true);
    setRecommendationError(null);
    try {
      setRecommendation(await requestRecommendation());
    } catch (error) {
      setRecommendationError(formatError(error, "추천을 불러오지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }

  async function loadHourlyRecommendations() {
    setBusy(true);
    setRecommendationError(null);
    try {
      const startHour = new Date().getHours();
      const hours = Array.from({ length: Math.min(6, 24 - startHour) }, (_, index) => startHour + index);
      const entries = await Promise.all(hours.map(async (hour) => [hour, await requestRecommendation(hour)] as const));
      setHourlyRecommendations(Object.fromEntries(entries));
    } catch (error) {
      setRecommendationError(formatError(error, "시간별 분석을 불러오지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }

  async function loadDashboard(targetLocation: SelectedLocation = location) {
    setBusy(true);
    setRecommendationError(null);
    try {
      const startHour = new Date().getHours();
      const hours = Array.from({ length: Math.min(6, 24 - startHour) }, (_, index) => startHour + index);
      // Fetch the current result first. This warms the per-location weather
      // cache before the six hourly reads, preventing duplicate provider calls.
      const current = await requestRecommendation(undefined, targetLocation);
      setRecommendation(current);
      const hourlyResults = await Promise.allSettled(hours.map(async (hour) => [hour, await requestRecommendation(hour, targetLocation)] as const));
      const entries = hourlyResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      setHourlyRecommendations(Object.fromEntries(entries));
      if (entries.length < hours.length) setRecommendationError("현재 분석은 표시했습니다. 일부 시간대 분석은 잠시 후 다시 시도해 주세요.");
    } catch (error) {
      setRecommendationError(formatError(error, "날씨와 개인화 분석을 불러오지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!authResolved) return;
    if (!session) return;
    const timer = window.setTimeout(() => { void loadProfile(); }, 0);
    return () => window.clearTimeout(timer);
  }, [authResolved, user?.id]);

  useEffect(() => {
    if (!authResolved || (session && !profileReady) || initialAnalysisStarted.current) return;
    initialAnalysisStarted.current = true;
    const timer = window.setTimeout(() => { void loadDashboard(); }, 0);
    return () => window.clearTimeout(timer);
  }, [authResolved, profileReady, session]);

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

  async function linkGoogleIdentity() {
    setBusy(true);
    setSaveMessage(null);
    try {
      const { error } = await supabase.auth.linkIdentity({ provider: "google", options: { redirectTo: `${window.location.origin}/app` } });
      if (error) throw error;
    } catch (error) {
      setSaveMessage(formatError(error, "Google 계정을 연결하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }

  async function unlinkGoogleIdentity() {
    const identity = user?.identities?.find((item) => item.provider === "google");
    if (!identity) return;
    if ((user?.identities?.length ?? 0) <= 1) {
      setSaveMessage("마지막 로그인 수단은 해제할 수 없습니다.");
      return;
    }
    setBusy(true);
    setSaveMessage(null);
    try {
      const { error } = await supabase.auth.unlinkIdentity(identity);
      if (error) throw error;
      setSaveMessage("Google 계정 연결을 해제했습니다.");
    } catch (error) {
      setSaveMessage(formatError(error, "Google 계정 연결을 해제하지 못했습니다."));
    } finally {
      setBusy(false);
    }
  }

  async function signOut(scope: "local" | "global") {
    const { error } = await supabase.auth.signOut({ scope });
    if (error) setSaveMessage(error.message);
  }

  async function downloadDataExport() {
    if (!session) return;
    setBusy(true);
    setSaveMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/me/data-export`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!response.ok) throw new Error("데이터 내보내기를 준비하지 못했습니다.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "pcrs-data-export.json";
      link.click();
      URL.revokeObjectURL(url);
      setSaveMessage("내 데이터 JSON 파일을 준비했습니다.");
    } catch (error) {
      setSaveMessage(formatError(error, "데이터를 내보내지 못했습니다."));
    } finally {
      setBusy(false);
    }
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
    <main className="min-h-screen bg-[radial-gradient(circle_at_15%_0%,#a7e6ff_0%,transparent_33%),linear-gradient(155deg,#1b91d4_0%,#2852b8_52%,#142460_100%)] px-0 py-0 text-slate-900 sm:px-6 sm:py-8">
      <section className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col overflow-hidden bg-[#f7faff]/95 shadow-2xl sm:min-h-[820px] sm:rounded-[36px]">
        <header className="flex items-center justify-between bg-[#09265f] px-5 py-4 text-white">
          <div className="flex items-center gap-2"><CloudSun className="text-sky-300" /><div><p className="text-sm font-black">THERMAL GUIDE</p><p className="text-[10px] text-sky-200">Personal weather wardrobe</p></div></div>
          {user ? <button onClick={() => setActiveTab("settings")} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold">{user.email ?? "계정"}</button> : <button onClick={() => { setAuthMode("signIn"); setAuthOpen(true); }} className="flex items-center gap-1 rounded-full bg-sky-400 px-3 py-1.5 text-xs font-black text-slate-950"><LogIn size={14} /> 로그인</button>}
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 pb-24">
          {activeTab === "home" && <HomeExperience location={location} profile={profile} recommendation={recommendation} hourlyRecommendations={hourlyRecommendations} busy={busy} error={recommendationError} feedbackMessage={feedbackMessage} selectedFeedback={selectedFeedback} quickMenuOpen={quickMenuOpen} onLocate={useCurrentLocation} onRefresh={loadDashboard} onOpenLocationPicker={() => { setQuickMenuOpen(false); setLocationPickerOpen(true); }} onToggleQuickMenu={() => setQuickMenuOpen((open) => !open)} onSettings={() => { setQuickMenuOpen(false); setActiveTab("settings"); }} onFeedback={submitFeedback} />}
          {activeTab === "hourly" && <HourlyTab activity={profile.default_activity} recommendations={hourlyRecommendations} onRefresh={loadHourlyRecommendations} busy={busy} error={recommendationError} />}
          {activeTab === "clothing" && <ClothingTab user={user} items={wardrobeItems} busy={busy} message={wardrobeMessage} onAdd={addWardrobe} onUpdate={updateWardrobe} onDelete={removeWardrobe} onLogin={() => { setAuthMode("signIn"); setAuthOpen(true); }} />}
          {activeTab === "settings" && <SettingsTab user={user} profile={profile} setProfile={setProfile} busy={busy} message={saveMessage} onLoad={loadProfile} onSave={saveProfile} onLogin={() => { setAuthMode("signIn"); setAuthOpen(true); }} onSignOutLocal={() => void signOut("local")} onSignOutAll={() => void signOut("global")} onEmailChange={updateAccountEmail} onPasswordChange={updateAccountPassword} onGoogleLink={linkGoogleIdentity} onGoogleUnlink={unlinkGoogleIdentity} onExport={downloadDataExport} onFeedbackReset={resetRecommendationFeedback} onDeletionRequest={requestAccountDeletion} onDeletionCancel={cancelAccountDeletion} location={location} savedLocations={savedLocations} onLoadLocations={loadSavedLocations} onSaveLocation={saveCurrentLocation} onSelectLocation={selectLocation} onDeleteLocation={removeSavedLocation} />}
        </div>

        <nav className="grid grid-cols-4 border-t border-slate-200 bg-white/95 px-2 py-2">
          <TabButton label="홈" active={activeTab === "home"} onClick={() => setActiveTab("home")} icon={<ThermometerSun size={20} />} />
          <TabButton label="시간별" active={activeTab === "hourly"} onClick={() => setActiveTab("hourly")} icon={<SlidersHorizontal size={20} />} />
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

function HomeExperience({ location, profile, recommendation, hourlyRecommendations, busy, error, feedbackMessage, selectedFeedback, quickMenuOpen, onLocate, onRefresh, onOpenLocationPicker, onToggleQuickMenu, onSettings, onFeedback }: { location: SelectedLocation; profile: UserProfile; recommendation: Recommendation | null; hourlyRecommendations: Record<number, Recommendation>; busy: boolean; error: string | null; feedbackMessage: string | null; selectedFeedback: "too_hot" | "comfortable" | "too_cold" | null; quickMenuOpen: boolean; onLocate: () => void; onRefresh: () => void; onOpenLocationPicker: () => void; onToggleQuickMenu: () => void; onSettings: () => void; onFeedback: (feedbackType: "too_hot" | "comfortable" | "too_cold") => void }) {
  const chartData = useMemo(() => Object.entries(hourlyRecommendations).map(([hour, item]) => ({ hour: `${String(hour).padStart(2, "0")}시`, 체감: Math.round(item.utci_personalized), 활동점수: Math.round(activityScore(item, profile.default_activity)) })), [hourlyRecommendations, profile.default_activity]);
  const weather = recommendation?.weather;
  const comfort = recommendation ? Math.max(8, Math.min(92, 50 + (22 - recommendation.utci_personalized) * 2.2)) : 50;
  const clothing = recommendation?.recommendations.clothing ?? ["분석을 시작하면 오늘의 착장을 제안합니다."];

  return <div className="space-y-4">
    <div className="relative flex items-center justify-between">
      <button onClick={onOpenLocationPicker} className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-left shadow-sm ring-1 ring-slate-100"><span className="grid h-7 w-7 place-items-center rounded-xl bg-sky-100 text-blue-600"><MapPin size={15} /></span><span><span className="block text-[10px] font-bold text-slate-400">분석 장소</span><span className="block max-w-44 truncate text-sm font-black text-slate-800">{location.label}</span></span><ChevronRight size={16} className="text-slate-400" /></button>
      <button aria-label="빠른 메뉴" onClick={onToggleQuickMenu} className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-slate-700 shadow-sm ring-1 ring-slate-100"><Menu size={19} /></button>
      {quickMenuOpen && <div className="absolute right-0 top-12 z-20 w-52 rounded-2xl bg-white p-2 shadow-xl ring-1 ring-slate-100"><button onClick={onOpenLocationPicker} className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-xs font-bold hover:bg-sky-50"><MapPin size={15} className="text-blue-600" />장소 선택·저장</button><button onClick={onRefresh} className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-xs font-bold hover:bg-sky-50"><Sparkles size={15} className="text-blue-600" />오늘 분석 업데이트</button><button onClick={onSettings} className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-xs font-bold hover:bg-sky-50"><Settings size={15} className="text-blue-600" />개인화 설정</button></div>}
    </div>

    <section className="overflow-hidden rounded-[30px] bg-[linear-gradient(135deg,#0b5fc4,#168fd4_62%,#72c7ee)] p-5 text-white shadow-lg">
      <div className="flex items-start justify-between"><div><p className="text-xs font-bold text-sky-100">{location.label} · 개인화 체감</p><p className="mt-1 text-5xl font-black tracking-tight">{recommendation ? `${Math.round(recommendation.utci_personalized)}°` : "--°"}</p><p className="mt-2 text-sm font-bold text-white/90">{recommendation?.thermal_sensation ?? "장소와 오늘의 날씨를 분석해 보세요"}</p></div><div className="relative grid h-24 w-24 place-items-center"><svg viewBox="0 0 120 120" className="h-24 w-24 -rotate-90"><circle cx="60" cy="60" r="45" fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="10" /><circle cx="60" cy="60" r="45" fill="none" stroke="#fef08a" strokeWidth="10" strokeLinecap="round" strokeDasharray="283" strokeDashoffset={283 - (283 * comfort) / 100} /></svg><span className="absolute text-center text-[10px] font-black leading-tight">쾌적<br />지수</span></div></div>
      <div className="mt-5 grid grid-cols-3 gap-2 border-t border-white/20 pt-4"><Metric icon={<Droplets size={16} />} label="습도" value={weather ? `${weather.humidity}%` : "--"} /><Metric icon={<Wind size={16} />} label="바람" value={weather ? `${weather.wind_speed}m/s` : "--"} /><Metric icon={<Umbrella size={16} />} label="강수" value={weather ? `${weather.precipitation_probability ?? 0}%` : "--"} /></div>
      <button disabled={busy} onClick={onRefresh} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-white/15 px-4 py-3 text-xs font-black backdrop-blur disabled:opacity-50"><Sparkles size={15} />{busy ? "개인화 분석 중…" : "이 장소의 오늘 분석하기"}</button>
    </section>

    {error && <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">{error}</p>}

    <section className="rounded-3xl bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-xs font-black text-blue-600">시간에 따른 체감 변화</p><h2 className="mt-1 font-black text-slate-900">언제 움직이면 좋을까요?</h2></div><span className="rounded-xl bg-sky-50 p-2 text-blue-600"><ActivityIcon size={18} /></span></div>{chartData.length ? <div className="mt-4 h-44"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}><defs><linearGradient id="thermalArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.42} /><stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" /><XAxis dataKey="hour" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#64748b" }} /><YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#64748b" }} /><Tooltip contentStyle={{ borderRadius: 14, border: "none", boxShadow: "0 8px 24px rgba(15,23,42,.12)", fontSize: 12 }} /><Area type="monotone" dataKey="체감" stroke="#0284c7" strokeWidth={3} fill="url(#thermalArea)" /><Line type="monotone" dataKey="활동점수" stroke="#22c55e" strokeWidth={2} dot={false} /></AreaChart></ResponsiveContainer></div> : <div className="mt-4 flex h-32 flex-col items-center justify-center rounded-2xl bg-slate-50 text-center"><CalendarDays className="text-slate-300" /><p className="mt-2 text-xs font-bold text-slate-500">장소 분석 후 6시간 흐름을 보여드립니다.</p></div>}<div className="mt-2 flex items-center gap-4 text-[10px] font-bold text-slate-500"><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-sky-600" />개인화 체감</span><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-green-500" />활동 적합도</span></div></section>

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

function LocationRow({ item, onSelect }: { item: LocationOption | SavedLocation; onSelect: (location: LocationOption | SavedLocation) => void }) {
  return <button onClick={() => onSelect(item)} className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-slate-100 transition hover:-translate-y-0.5 hover:ring-blue-200"><span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-600"><MapPin size={17} /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-800">{item.name}</span><span className="mt-0.5 block text-[11px] text-slate-500">{item.latitude.toFixed(3)}, {item.longitude.toFixed(3)}</span></span><ChevronRight size={16} className="text-slate-400" /></button>;
}

function HomeTab({ location, profile, recommendation, busy, error, onLocate, onRefresh, onSettings, onFeedback }: { location: { label: string }; profile: UserProfile; recommendation: Recommendation | null; busy: boolean; error: string | null; onLocate: () => void; onRefresh: () => void; onSettings: () => void; onFeedback: (feedbackType: "too_hot" | "comfortable" | "too_cold") => void }) {
  const clothing = recommendation?.recommendations.clothing ?? ["날씨를 불러오면 맞춤 착장을 제안합니다."];
  return <div className="space-y-4">
    <div className="flex items-center justify-between"><button onClick={onLocate} className="flex items-center gap-1 rounded-full bg-white px-3 py-2 text-xs font-bold shadow-sm"><MapPin size={14} className="text-blue-600" />{location.label}</button><button onClick={onSettings} className="rounded-full bg-white p-2 shadow-sm"><Menu size={16} /></button></div>
    <section className="rounded-[28px] bg-[linear-gradient(135deg,#1b8bd6,#2a4cb4)] p-5 text-white shadow-lg"><div className="flex items-start justify-between"><div><p className="text-sm text-sky-100">오늘의 체감</p><p className="mt-1 text-5xl font-black">{recommendation ? `${Math.round(recommendation.utci_personalized)}°` : "--°"}</p><p className="mt-2 text-sm font-bold">{recommendation?.thermal_sensation ?? "날씨를 업데이트해 주세요"}</p></div><CloudSun size={62} className="text-sky-200" /></div><button disabled={busy} onClick={onRefresh} className="mt-5 rounded-xl bg-white/15 px-3 py-2 text-xs font-bold disabled:opacity-50">{busy ? "날씨 분석 중…" : "현재 날씨로 추천받기"}</button></section>
    {error && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{error}</p>}
    <section className="rounded-3xl bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><Shirt className="text-blue-600" /><div><h1 className="font-black">오늘의 착장</h1><p className="text-xs text-slate-500">{activityLabels[profile.default_activity]} · {environmentLabels[profile.default_environment]}</p></div></div><ul className="mt-4 space-y-2">{clothing.map((item) => <li key={item} className="rounded-xl bg-sky-50 px-3 py-2 text-sm font-semibold text-slate-700">{item}</li>)}</ul>{recommendation?.nudge?.nudge_warning && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{recommendation.nudge.nudge_message}</p>}{recommendation && <div className="mt-4 border-t border-slate-100 pt-3"><p className="text-xs font-bold text-slate-500">추천 착용감은 어땠나요?</p><div className="mt-2 grid grid-cols-3 gap-2"><button onClick={() => onFeedback("too_cold")} className="rounded-lg bg-sky-50 px-2 py-2 text-xs font-bold text-sky-700">추웠어요</button><button onClick={() => onFeedback("comfortable")} className="rounded-lg bg-emerald-50 px-2 py-2 text-xs font-bold text-emerald-700">좋았어요</button><button onClick={() => onFeedback("too_hot")} className="rounded-lg bg-rose-50 px-2 py-2 text-xs font-bold text-rose-700">더웠어요</button></div></div>}</section>
    <section className="grid grid-cols-3 gap-2">{[[Droplets, recommendation?.weather?.humidity ? `${recommendation.weather.humidity}%` : "습도"], [Wind, recommendation?.weather?.wind_speed ? `${recommendation.weather.wind_speed}m/s` : "바람"], [Umbrella, "강수 확인"]].map(([Icon, label]) => { const MetricIcon = Icon as typeof Droplets; return <div key={String(label)} className="rounded-2xl bg-white p-3 text-center shadow-sm"><MetricIcon className="mx-auto text-blue-500" size={18} /><p className="mt-1 text-[11px] font-bold text-slate-600">{label as string}</p></div>; })}</section>
  </div>;
}

function HourlyTab({ activity, recommendations, onRefresh, busy, error }: { activity: Activity; recommendations: Record<number, Recommendation>; onRefresh: () => void; busy: boolean; error: string | null }) {
  const now = new Date();
  const hours = Array.from({ length: Math.min(6, 24 - now.getHours()) }, (_, index) => now.getHours() + index);
  const scoreForActivity = (item: Recommendation) => {
    const key = activity === "running" ? "러닝" : activity === "cycling" ? "라이딩" : "산책";
    return item.suitability?.find((score) => score.name.includes(key))?.score ?? Math.max(0, 100 - Math.abs(item.utci_personalized - 22) * 6);
  };
  const available = hours.map((hour) => recommendations[hour]).filter((item): item is Recommendation => Boolean(item));
  const best = available.reduce<Recommendation | null>((current, item) => !current || scoreForActivity(item) > scoreForActivity(current) ? item : current, null);
  const bestHour = best ? hours.find((hour) => recommendations[hour] === best) : undefined;
  return <div className="space-y-4">
    <section className="rounded-[28px] bg-[linear-gradient(135deg,#1b8bd6,#2a4cb4)] p-5 text-white shadow-lg">
      <p className="text-sm font-bold text-sky-100">활동 계획</p><h1 className="mt-1 text-2xl font-black">언제 활동하면 좋을까요?</h1><p className="mt-2 text-sm text-sky-100">{activityLabels[activity]} 기준으로 다음 6시간을 비교했어요.</p>
      <div className="mt-5 flex items-end justify-between rounded-2xl bg-white/10 px-4 py-3"><div><p className="text-[11px] font-bold text-sky-100">가장 편안한 시간</p><p className="mt-1 text-xl font-black">{bestHour === undefined ? "분석 중" : `${String(bestHour).padStart(2, "0")}:00`}</p></div><p className="text-sm font-bold">{best ? `${Math.round(scoreForActivity(best))}점` : "--"}</p></div>
    </section>
    <button onClick={onRefresh} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 p-4 text-sm font-bold text-white shadow-sm disabled:opacity-50"><Sparkles size={16} />{busy ? "시간별 분석 중…" : "오늘 시간대 다시 분석"}</button>
    {error && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{error}</p>}
    <section className="rounded-3xl bg-white p-3 shadow-sm"><p className="px-2 pb-2 pt-1 text-xs font-bold text-slate-500">시간대별 활동 적합도</p><div className="space-y-2">{hours.map((hour) => { const item = recommendations[hour]; const score = item ? scoreForActivity(item) : 0; return <div key={hour} className="rounded-2xl bg-slate-50 p-3"><div className="flex items-center gap-3"><p className="w-12 text-sm font-black text-slate-800">{`${String(hour).padStart(2, "0")}:00`}</p><div className="h-2 flex-1 overflow-hidden rounded-full bg-white"><div className={`h-full rounded-full ${score >= 75 ? "bg-emerald-500" : score >= 50 ? "bg-amber-400" : "bg-rose-500"}`} style={{ width: `${score}%` }} /></div><p className="w-12 text-right text-xs font-black text-slate-600">{item ? `${Math.round(score)}점` : "--"}</p></div>{item && <p className="mt-2 text-xs text-slate-500">체감 {Math.round(item.utci_personalized)}° · 강수 {item.weather?.precipitation_probability ?? 0}% · {item.thermal_sensation}</p>}</div>; })}</div></section>
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

function SettingsTab({ user, profile, setProfile, busy, message, onLoad, onSave, onLogin, onSignOutLocal, onSignOutAll, onEmailChange, onPasswordChange, onGoogleLink, onGoogleUnlink, onExport, onFeedbackReset, onDeletionRequest, onDeletionCancel, location, savedLocations, onLoadLocations, onSaveLocation, onSelectLocation, onDeleteLocation }: { user: User | null; profile: UserProfile; setProfile: (profile: UserProfile) => void; busy: boolean; message: string | null; onLoad: () => void; onSave: () => void; onLogin: () => void; onSignOutLocal: () => void; onSignOutAll: () => void; onEmailChange: (email: string) => Promise<void>; onPasswordChange: (password: string) => Promise<void>; onGoogleLink: () => Promise<void>; onGoogleUnlink: () => Promise<void>; onExport: () => Promise<void>; onFeedbackReset: () => Promise<void>; onDeletionRequest: (phrase: string) => Promise<void>; onDeletionCancel: () => Promise<void>; location: { label: string }; savedLocations: SavedLocation[]; onLoadLocations: () => Promise<void>; onSaveLocation: () => Promise<void>; onSelectLocation: (location: SavedLocation) => void; onDeleteLocation: (locationId: string) => Promise<void> }) {
  const update = <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => setProfile({ ...profile, [key]: value });
  const [nextEmail, setNextEmail] = useState(user?.email ?? "");
  const [nextPassword, setNextPassword] = useState("");
  const [deletePhrase, setDeletePhrase] = useState("");

  if (!user) return <div className="space-y-4"><section className="rounded-[28px] bg-[linear-gradient(135deg,#1b8bd6,#2a4cb4)] p-5 text-white shadow-lg"><p className="text-sm font-bold text-sky-100">개인화 설정</p><h1 className="mt-1 text-2xl font-black">내 체감에 맞춰 볼까요?</h1><p className="mt-2 text-sm text-sky-100">신체 정보와 활동 선호를 저장하면 추천이 더 나에게 맞아져요.</p></section><button onClick={onLogin} className="w-full rounded-2xl bg-blue-600 p-4 text-sm font-bold text-white shadow-sm">로그인 또는 회원가입</button></div>;

  return <div className="space-y-4">
    <section className="rounded-[28px] bg-[linear-gradient(135deg,#1b8bd6,#2a4cb4)] p-5 text-white shadow-lg"><div className="flex items-start justify-between"><div><p className="text-sm font-bold text-sky-100">계정 및 개인화</p><h1 className="mt-1 max-w-72 truncate text-xl font-black">{user.email}</h1><p className="mt-2 text-sm text-sky-100">추천에 반영할 정보를 관리하세요.</p></div><span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15"><UserRound size={22} /></span></div></section>
    <div className="flex gap-2"><button onClick={onLoad} disabled={busy} className="flex-1 rounded-xl border border-slate-200 bg-white p-3 text-xs font-bold shadow-sm">저장 정보 불러오기</button><button onClick={onSignOutLocal} className="rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-500 shadow-sm">이 기기 로그아웃</button></div>
    {message && <p className="rounded-xl bg-sky-50 p-3 text-xs text-sky-800">{message}</p>}
    <section className="space-y-3 rounded-3xl bg-white p-5 shadow-sm"><h2 className="font-black">로그인 정보</h2><Field label="변경할 이메일" value={nextEmail} onChange={setNextEmail} type="text" /><button onClick={() => void onEmailChange(nextEmail)} disabled={busy || !nextEmail} className="w-full rounded-xl border border-blue-200 p-3 text-xs font-bold text-blue-700 disabled:opacity-50">이메일 변경 요청</button><label className="block text-xs font-bold text-slate-600">새 비밀번호<input minLength={8} type="password" value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm" /></label><button onClick={() => { void onPasswordChange(nextPassword); setNextPassword(""); }} disabled={busy || nextPassword.length < 8} className="w-full rounded-xl border border-blue-200 p-3 text-xs font-bold text-blue-700 disabled:opacity-50">비밀번호 변경</button><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-700">Google 계정</p><p className="mt-1 text-xs text-slate-500">{user.identities?.some((identity) => identity.provider === "google") ? "연결됨" : "연결되지 않음"}</p><div className="mt-2 grid grid-cols-2 gap-2">{user.identities?.some((identity) => identity.provider === "google") ? <button onClick={() => void onGoogleUnlink()} disabled={busy} className="rounded-lg border border-slate-200 bg-white p-2 text-xs font-bold text-slate-600 disabled:opacity-50">Google 연결 해제</button> : <button onClick={() => void onGoogleLink()} disabled={busy} className="rounded-lg border border-blue-200 bg-white p-2 text-xs font-bold text-blue-700 disabled:opacity-50">Google 연결</button>}<button onClick={onSignOutAll} disabled={busy} className="rounded-lg border border-slate-200 bg-white p-2 text-xs font-bold text-slate-600 disabled:opacity-50">모든 기기 로그아웃</button></div></div></section>
    <section className="space-y-3 rounded-3xl bg-white p-5 shadow-sm"><h2 className="font-black">선택 개인화 정보</h2><p className="text-xs text-slate-500">입력하지 않아도 일반 추천을 사용할 수 있습니다.</p><div className="grid grid-cols-2 gap-3"><Field label="키 (cm)" value={profile.height_cm} onChange={(value) => update("height_cm", value)} type="number" /><Field label="몸무게 (kg)" value={profile.weight_kg} onChange={(value) => update("weight_kg", value)} type="number" /><Field label="체지방률 (%)" value={profile.body_fat_pct} onChange={(value) => update("body_fat_pct", value)} type="number" /><Field label="출생 연도" value={profile.birth_year} onChange={(value) => update("birth_year", value)} type="number" /></div><label className="block text-xs font-bold text-slate-600">성별(선택)<select value={profile.sex} onChange={(event) => update("sex", event.target.value as Sex)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm"><option value="undisclosed">응답 안 함</option><option value="female">여성</option><option value="male">남성</option></select></label></section>
    <section className="space-y-3 rounded-3xl bg-white p-5 shadow-sm"><h2 className="font-black">활동과 환경</h2><label className="block text-xs font-bold text-slate-600">기본 활동<select value={profile.default_activity} onChange={(event) => update("default_activity", event.target.value as Activity)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm">{Object.entries(activityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="block text-xs font-bold text-slate-600">환경<select value={profile.default_environment} onChange={(event) => update("default_environment", event.target.value as Environment)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm">{Object.entries(environmentLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>{profile.default_environment !== "outdoor" && <Field label="실내 온도 (°C)" value={profile.indoor_temperature_c} onChange={(value) => update("indoor_temperature_c", value)} type="number" />}<label className="block text-xs font-bold text-slate-600">추위/더위 민감도<div className="mt-2 flex items-center gap-3"><input type="range" min="-2" max="2" step="1" value={profile.thermal_sensitivity} onChange={(event) => update("thermal_sensitivity", Number(event.target.value))} className="flex-1 accent-blue-600" /><span className="w-14 text-center text-xs font-black">{profile.thermal_sensitivity > 0 ? `더위 +${profile.thermal_sensitivity}` : profile.thermal_sensitivity < 0 ? `추위 ${profile.thermal_sensitivity}` : "보통"}</span></div></label></section>
    <button onClick={onSave} disabled={busy} className="w-full rounded-2xl bg-blue-600 p-4 text-sm font-black text-white disabled:opacity-50">{busy ? "저장 중…" : "개인화 프로필 저장"}</button>
    <section className="space-y-3 rounded-3xl bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-black">즐겨찾는 장소</h2><button onClick={() => void onLoadLocations()} disabled={busy} className="text-xs font-bold text-blue-600">새로고침</button></div><p className="text-xs text-slate-500">현재 위치: {location.label}</p><button onClick={() => void onSaveLocation()} disabled={busy} className="w-full rounded-xl border border-blue-200 p-3 text-xs font-bold text-blue-700 disabled:opacity-50">현재 장소 저장</button><div className="space-y-2">{savedLocations.length === 0 ? <p className="text-center text-xs text-slate-400">저장된 장소가 없습니다.</p> : savedLocations.map((item) => <div key={item.id} className="flex items-center gap-2 rounded-xl bg-slate-50 p-3"><button onClick={() => onSelectLocation(item)} className="min-w-0 flex-1 text-left"><p className="truncate text-sm font-bold">{item.name}</p><p className="text-[11px] text-slate-500">{item.latitude.toFixed(3)}, {item.longitude.toFixed(3)}</p></button><button aria-label={`${item.name} 삭제`} onClick={() => void onDeleteLocation(item.id)} disabled={busy} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-500"><Trash2 size={15} /></button></div>)}</div></section>
    <section className="space-y-3 rounded-3xl border border-rose-200 bg-rose-50 p-5"><h2 className="font-black text-rose-800">데이터와 계정 삭제</h2><button onClick={() => void onExport()} disabled={busy} className="w-full rounded-xl border border-rose-200 bg-white p-3 text-xs font-bold text-rose-700 disabled:opacity-50">내 데이터 JSON 내보내기</button><button onClick={() => void onFeedbackReset()} disabled={busy} className="w-full rounded-xl border border-rose-200 bg-white p-3 text-xs font-bold text-rose-700 disabled:opacity-50">누적 착용감 피드백 초기화</button><p className="text-xs text-rose-700">탈퇴 요청 후 30일 동안 취소할 수 있습니다. 요청 전 다시 로그인해야 하며, 아래에 DELETE를 입력하세요.</p><Field label="확인 문구" value={deletePhrase} onChange={setDeletePhrase} type="text" /><button onClick={() => void onDeletionRequest(deletePhrase)} disabled={busy || deletePhrase !== "DELETE"} className="w-full rounded-xl bg-rose-600 p-3 text-xs font-bold text-white disabled:opacity-50">30일 후 계정 삭제 요청</button><button onClick={() => void onDeletionCancel()} disabled={busy} className="w-full rounded-xl border border-rose-300 bg-white p-3 text-xs font-bold text-rose-700 disabled:opacity-50">탈퇴 요청 취소</button></section>
  </div>;
}

function Field({ label, value, onChange, type }: { label: string; value: string; onChange: (value: string) => void; type: "number" | "text" }) {
  return <label className="block text-xs font-bold text-slate-600">{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm" /></label>;
}

function AuthModal({ mode, email, password, terms, privacy, marketing, busy, message, error, onClose, onModeChange, onEmailChange, onPasswordChange, onTermsChange, onPrivacyChange, onMarketingChange, onSubmit, onGoogle, onReset }: { mode: "signIn" | "signUp"; email: string; password: string; terms: boolean; privacy: boolean; marketing: boolean; busy: boolean; message: string | null; error: string | null; onClose: () => void; onModeChange: (mode: "signIn" | "signUp") => void; onEmailChange: (email: string) => void; onPasswordChange: (password: string) => void; onTermsChange: (value: boolean) => void; onPrivacyChange: (value: boolean) => void; onMarketingChange: (value: boolean) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onGoogle: () => void; onReset: () => void }) {
  const isSignUp = mode === "signUp";
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-5 backdrop-blur-sm"><div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-sm font-black text-blue-600">THERMAL GUIDE</p><h2 className="mt-1 text-xl font-black">{isSignUp ? "계정 만들기" : "로그인"}</h2></div><button onClick={onClose} className="rounded-full bg-slate-100 px-3 py-1 text-sm">×</button></div>{error && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}{message && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700">{message}</p>}<form onSubmit={onSubmit} className="mt-5 space-y-3"><Field label="이메일" value={email} onChange={onEmailChange} type="text" /><label className="block text-xs font-bold text-slate-600">비밀번호<input required minLength={8} type="password" value={password} onChange={(event) => onPasswordChange(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm" /></label>{isSignUp && <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-xs"><label className="flex gap-2"><input type="checkbox" checked={terms} onChange={(event) => onTermsChange(event.target.checked)} />[필수] 이용약관 동의</label><label className="flex gap-2"><input type="checkbox" checked={privacy} onChange={(event) => onPrivacyChange(event.target.checked)} />[필수] 개인정보 처리방침 동의</label><label className="flex gap-2"><input type="checkbox" checked={marketing} onChange={(event) => onMarketingChange(event.target.checked)} />[선택] 제품 소식 수신</label></div>}<button disabled={busy} className="w-full rounded-xl bg-blue-600 p-3 text-sm font-black text-white disabled:opacity-50">{isSignUp ? "이메일로 회원가입" : "로그인"}</button></form><button onClick={onGoogle} className="mt-3 w-full rounded-xl border border-slate-200 p-3 text-sm font-bold">Google로 계속하기</button>{!isSignUp && <button onClick={onReset} className="mt-3 w-full text-xs font-bold text-blue-600">비밀번호를 잊으셨나요?</button>}<button onClick={() => onModeChange(isSignUp ? "signIn" : "signUp")} className="mt-5 w-full text-xs font-bold text-slate-500">{isSignUp ? "이미 계정이 있으신가요? 로그인" : "계정이 없으신가요? 회원가입"}</button></div></div>;
}
