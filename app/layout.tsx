import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { toHtmlLang } from '@/lib/i18n';
import { getServerLocale } from '@/lib/i18n-server';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Order Converter AI',
  description: 'Convert purchase order PDFs into editable structured orders',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getServerLocale();

  return (
    <html lang={toHtmlLang(locale)}>
      <body className={`${inter.className} antialiased`}>
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
