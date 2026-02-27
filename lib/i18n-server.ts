import { cookies } from 'next/headers';
import { LOCALE_COOKIE, resolveLocale, type Locale } from '@/lib/i18n';

export async function getServerLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  return resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value);
}
