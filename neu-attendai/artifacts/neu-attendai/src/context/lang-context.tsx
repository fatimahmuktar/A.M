import { createContext, useContext, useState, type ReactNode } from "react";
import { type Lang, DEFAULT_LANG, t, type TKey } from "@/lib/i18n";

interface LangContextValue {
  lang:   Lang;
  toggle: () => void;
  t:      (key: TKey) => string;
}

const LangContext = createContext<LangContextValue | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    const stored = localStorage.getItem("neu_lang");
    return (stored === "EN" || stored === "TR") ? stored : DEFAULT_LANG;
  });

  const toggle = () =>
    setLang((prev) => {
      const next: Lang = prev === "EN" ? "TR" : "EN";
      localStorage.setItem("neu_lang", next);
      return next;
    });

  const translate = (key: TKey) => t(key, lang);

  return (
    <LangContext.Provider value={{ lang, toggle, t: translate }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used inside LangProvider");
  return ctx;
}
