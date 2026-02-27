import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LanguageSwitcher } from '@/components/language-switcher';
import { TariffManager } from '@/components/tariff/tariff-manager';
import { getServerLocale } from '@/lib/i18n-server';
import { translate } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export default async function TariffsPage() {
  const locale = await getServerLocale();
  const t = (key: string, fallback: string, params?: Record<string, string | number>) =>
    translate(locale, key, fallback, params);

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">
          {t('Tariffs.title', 'Tariff Sync Table')}
        </h2>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background hover:bg-accent h-9 px-4 py-2"
          >
            {t('Tariffs.backToDashboard', 'Back to Dashboard')}
          </Link>
          <LanguageSwitcher />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('Tariffs.settings', 'Product Class Tariff Settings')}</CardTitle>
        </CardHeader>
        <CardContent>
          <TariffManager />
        </CardContent>
      </Card>
    </div>
  );
}
