'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { LOCALE_COOKIE, translate, toHtmlLang, type Locale } from '@/lib/i18n';

type TranslateParams = Record<string, string | number>;

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, fallback?: string, params?: TranslateParams) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

interface LocaleProviderProps {
  initialLocale: Locale;
  children: React.ReactNode;
}

export function LocaleProvider({ initialLocale, children }: LocaleProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
    document.cookie = `${LOCALE_COOKIE}=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = toHtmlLang(nextLocale);
  }, []);

  useEffect(() => {
    document.documentElement.lang = toHtmlLang(locale);
  }, [locale]);

  const t = useCallback(
    (key: string, fallback?: string, params?: TranslateParams) =>
      translate(locale, key, fallback, params),
    [locale]
  );

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t,
    }),
    [locale, setLocale, t]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useI18n must be used within LocaleProvider');
  }
  return context;
}
