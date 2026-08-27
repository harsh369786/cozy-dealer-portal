import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "@/locales/en.json";
import hi from "@/locales/hi.json";

export const LOCALE_STORAGE_KEY = "backrest_locale";
export const SUPPORTED_LOCALES = ["en", "hi"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

function readStoredLocale(): Locale {
  if (typeof window === "undefined") return "en";
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === "en" || stored === "hi") return stored;
  } catch {
    // ignore
  }
  return "en";
}

export function getIntlLocale(locale?: string): string {
  return locale === "hi" ? "hi-IN" : "en-IN";
}

export function getLocale(): Locale {
  const lng = i18n.language;
  return lng === "hi" ? "hi" : "en";
}

export async function setLocale(locale: Locale): Promise<void> {
  await i18n.changeLanguage(locale);
}

function applyDocumentLocale(locale: string) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale === "hi" ? "hi" : "en";
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    hi: { translation: hi },
  },
  lng: readStoredLocale(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

i18n.on("languageChanged", (lng) => {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, lng);
  } catch {
    // ignore
  }
  applyDocumentLocale(lng);
});

applyDocumentLocale(readStoredLocale());

export default i18n;
