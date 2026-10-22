import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { Plus_Jakarta_Sans, Geist_Mono } from 'next/font/google';
import { AppProviders } from '@/client/store/provider';
import { I18nProvider } from '@/i18n/provider';
import { getLocale, getMessages, getTranslations } from '@/i18n/server';
import { NONCE_REQUEST_HEADER } from '@/server/http/csp';
import './globals.css';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-plus-jakarta-sans',
  display: 'swap',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return {
    title: { default: 'Sineva', template: '%s · Sineva' },
    description: t('description'),
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3f6f6' },
    { media: '(prefers-color-scheme: dark)', color: '#071417' },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  const messages = await getMessages();
  // Reading the request headers makes every page render per request, which a
  // per-request nonce requires anyway.
  const nonce = (await headers()).get(NONCE_REQUEST_HEADER) ?? undefined;

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${plusJakartaSans.variable} ${geistMono.variable}`}
    >
      <body>
        <I18nProvider locale={locale} messages={messages}>
          <AppProviders nonce={nonce}>{children}</AppProviders>
        </I18nProvider>
      </body>
    </html>
  );
}
