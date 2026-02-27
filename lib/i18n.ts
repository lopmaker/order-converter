import enMessages from '@/messages/en.json';
import zhMessages from '@/messages/zh.json';

export const LOCALE_COOKIE = 'oc_locale';

export const SUPPORTED_LOCALES = ['en', 'zh'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

type MessageDictionary = Record<string, unknown>;

const MESSAGES: Record<Locale, MessageDictionary> = {
  en: enMessages as MessageDictionary,
  zh: zhMessages as MessageDictionary,
};

function getNestedValue(obj: MessageDictionary, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[key];
  }, obj);
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key];
    return value === undefined ? `{${key}}` : String(value);
  });
}

export function resolveLocale(input?: string | null): Locale {
  if (input && SUPPORTED_LOCALES.includes(input as Locale)) {
    return input as Locale;
  }
  return DEFAULT_LOCALE;
}

export function translate(
  locale: Locale,
  key: string,
  fallback?: string,
  params?: Record<string, string | number>
): string {
  const value = getNestedValue(MESSAGES[locale], key);
  if (typeof value === 'string') {
    return interpolate(value, params);
  }

  if (fallback) {
    return interpolate(fallback, params);
  }

  return key;
}

export function toHtmlLang(locale: Locale): string {
  return locale === 'zh' ? 'zh-CN' : 'en';
}
