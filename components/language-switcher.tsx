'use client';

import { useI18n } from '@/components/locale-provider';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const router = useRouter();

  const handleLocaleChange = (nextLocale: 'en' | 'zh') => {
    if (nextLocale === locale) return;
    setLocale(nextLocale);
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Globe className="h-4 w-4" />
          <span className="sr-only">{t('Language.switch', 'Switch language')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => handleLocaleChange('en')}
          className={cn(locale === 'en' && 'font-semibold')}
        >
          {t('Language.english', 'English')}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleLocaleChange('zh')}
          className={cn(locale === 'zh' && 'font-semibold')}
        >
          {t('Language.chinese', '中文')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
