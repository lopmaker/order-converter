'use client';

import { LocaleProvider } from '@/components/locale-provider';
import { OrdersProvider } from '@/components/orders-provider';
import { type Locale } from '@/lib/i18n';
import { Toaster } from 'react-hot-toast';

interface ProvidersProps {
  locale: Locale;
  children: React.ReactNode;
}

export function Providers({ locale, children }: ProvidersProps) {
  return (
    <LocaleProvider initialLocale={locale}>
      <OrdersProvider>
        {children}
        <Toaster position="bottom-right" toastOptions={{ duration: 5000 }} />
      </OrdersProvider>
    </LocaleProvider>
  );
}
