import { createContext, useCallback, useContext, useEffect, useState } from "react";
import en from "../i18n/locales/en";
import es from "../i18n/locales/es";
import fr from "../i18n/locales/fr";
import pt from "../i18n/locales/pt";
import zh from "../i18n/locales/zh";
import id from "../i18n/locales/id";

const LOCALES = { en, es, fr, pt, zh, id };

export const LANGUAGES = [
  { code: "en", name: "English", native: "English", flag: "🇬🇧" },
  { code: "es", name: "Spanish", native: "Español", flag: "🇪🇸" },
  { code: "fr", name: "French", native: "Français", flag: "🇫🇷" },
  { code: "pt", name: "Portuguese", native: "Português", flag: "🇵🇹" },
  { code: "zh", name: "Chinese", native: "中文", flag: "🇨🇳" },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia", flag: "🇮🇩" },
];

const KEY = "chromalens_lang_v1";

function detect() {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored && LOCALES[stored]) return stored;
    const nav = (navigator.language || "en").toLowerCase();
    for (const code of Object.keys(LOCALES)) {
      if (nav === code || nav.startsWith(code + "-")) return code;
    }
  } catch {
    // ignore
  }
  return "en";
}

const I18nCtx = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(detect);

  const setLang = useCallback((l) => {
    if (!LOCALES[l]) return;
    setLangState(l);
    try { localStorage.setItem(KEY, l); } catch { /* noop */ }
    if (typeof document !== "undefined") document.documentElement.lang = l;
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback((key, vars) => {
    const parts = String(key).split(".");
    const look = (root) => {
      let node = root;
      for (const p of parts) {
        if (node == null) return null;
        node = node[p];
      }
      return node;
    };
    let val = look(LOCALES[lang]);
    if (val == null) val = look(LOCALES.en);
    if (typeof val !== "string") return key;
    if (!vars) return val;
    return val.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
  }, [lang]);

  return (
    <I18nCtx.Provider value={{ lang, setLang, t, languages: LANGUAGES }}>
      {children}
    </I18nCtx.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nCtx);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
