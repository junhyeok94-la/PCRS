import { SIDO_I18N, SIGUNGU_I18N } from "./sido_i18n";

type Lang = "ko" | "en" | "ja";

/**
 * 한글 행정단위 접미사 → 영문 로마자 변환
 * 행정안전부 로마자 표기 기준
 */
const SUFFIX_MAP_EN: [string, string][] = [
  ["특별자치시", ""],
  ["특별자치도", ""],
  ["특별시", ""],
  ["광역시", ""],
  ["자치시", ""],
  ["자치구", "-gu"],
  ["시", "-si"],
  ["군", "-gun"],
  ["구", "-gu"],
  ["읍", "-eup"],
  ["면", "-myeon"],
  ["동", "-dong"],
];

const SUFFIX_MAP_JA: [string, string][] = [
  ["특별자치시", "特別自治市"],
  ["특별자치도", "特別自治道"],
  ["특별시", "特別市"],
  ["광역시", "広域市"],
  ["자치구", "自治区"],
  ["시", "市"],
  ["군", "郡"],
  ["구", "区"],
  ["읍", "邑"],
  ["면", "面"],
];

/**
 * 시도 이름을 지정된 언어로 반환
 */
export function translateSido(sido: string, lang: Lang): string {
  if (lang === "ko") return sido;
  const entry = SIDO_I18N[sido];
  if (!entry) return sido;
  return entry[lang];
}

/**
 * 시군구 이름을 지정된 언어로 반환
 * - 번역 사전에 있으면 사전 사용
 * - 없으면 접미사 기반 자동 변환 (Fallback)
 */
export function translateSigungu(sigungu: string, lang: Lang): string {
  if (lang === "ko") return sigungu;

  const entry = SIGUNGU_I18N[sigungu];
  if (entry) return entry[lang];

  // Fallback: 접미사 변환
  if (lang === "en") {
    for (const [suffix, replacement] of SUFFIX_MAP_EN) {
      if (sigungu.endsWith(suffix)) {
        const base = sigungu.slice(0, sigungu.length - suffix.length);
        // 간단한 발음 기반 로마자화 (영어 표기 첫 글자 대문자)
        return base + replacement;
      }
    }
    return sigungu; // 변환 불가 시 원문 반환
  }

  if (lang === "ja") {
    for (const [suffix, jaChar] of SUFFIX_MAP_JA) {
      if (sigungu.endsWith(suffix)) {
        const base = sigungu.slice(0, sigungu.length - suffix.length);
        return base + jaChar;
      }
    }
    return sigungu;
  }

  return sigungu;
}
