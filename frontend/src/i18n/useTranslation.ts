"use client";

import { useState, useCallback } from "react";
import ko from "./locales/ko";
import en from "./locales/en";
import ja from "./locales/ja";
import { translateSido, translateSigungu } from "./regions/sigungu_romanize";

export type Lang = "ko" | "en" | "ja";

const LOCALES: Record<Lang, Record<string, string>> = { ko, en, ja };

const LANG_LABELS: Record<Lang, string> = {
  ko: "한국어",
  en: "English",
  ja: "日本語",
};

const LANG_STORAGE_KEY = "thermal_guide_lang";

function getInitialLang(): Lang {
  if (typeof window === "undefined") return "ko";
  const saved = localStorage.getItem(LANG_STORAGE_KEY) as Lang | null;
  if (saved && saved in LOCALES) return saved;
  // 브라우저 언어 자동 감지
  const browserLang = navigator.language.slice(0, 2);
  if (browserLang === "en") return "en";
  if (browserLang === "ja") return "ja";
  return "ko";
}

export function useTranslation() {
  const [lang, setLangState] = useState<Lang>(getInitialLang);

  const setLang = useCallback((newLang: Lang) => {
    setLangState(newLang);
    if (typeof window !== "undefined") {
      localStorage.setItem(LANG_STORAGE_KEY, newLang);
    }
  }, []);

  /** UI 텍스트 번역 함수 */
  const t = useCallback(
    (key: string, fallback?: string): string => {
      return LOCALES[lang][key] ?? fallback ?? key;
    },
    [lang]
  );

  /** 시도 지역명 번역 */
  const tSido = useCallback(
    (sido: string): string => translateSido(sido, lang),
    [lang]
  );

  /** 시군구 지역명 번역 */
  const tSigungu = useCallback(
    (sigungu: string): string => translateSigungu(sigungu, lang),
    [lang]
  );

  return {
    lang,
    setLang,
    t,
    tSido,
    tSigungu,
    langLabels: LANG_LABELS,
    langs: ["ko", "en", "ja"] as Lang[],
  };
}
