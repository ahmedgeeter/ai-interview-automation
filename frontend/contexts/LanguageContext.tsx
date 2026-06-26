"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import en from "../locales/en.json";
import ar from "../locales/ar.json";

type Locale = "en" | "ar";
type Translations = typeof en;

interface LanguageContextType {
  locale: Locale;
  t: (key: keyof Translations) => string;
  toggleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>("en");

  // Load saved locale from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("locale") as Locale;
    if (saved && (saved === "en" || saved === "ar")) {
      setLocale(saved);
    }
  }, []);

  const toggleLanguage = () => {
    setLocale((prev) => {
      const next = prev === "en" ? "ar" : "en";
      localStorage.setItem("locale", next);
      return next;
    });
  };

  const t = (key: keyof Translations): string => {
    const translations: any = locale === "en" ? en : ar;
    return translations[key] || key;
  };

  // Sync html dir attribute
  useEffect(() => {
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <LanguageContext.Provider value={{ locale, t, toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
