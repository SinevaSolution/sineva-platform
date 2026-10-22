import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { ThemeScript } from '@/client/components/theme_script';
import { AppProviders } from '@/client/store/provider';
import { I18nProvider } from '@/i18n/provider';
import { getLocale, getMessages, getTranslations } from '@/i18n/server';
import { NONCE_REQUEST_HEADER } from '@/server/http/csp';
import { geistMono, plusJakartaSans } from '@/styles/fonts';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return {
    title: { default: 'Sineva', template: '%s · Sineva' },
    description: t('description'),
  };
}

export const viewport: Viewport = {
  themeColor: [
    // The app background is --color-canvas-alt: ink-50 in light, the dark
    // canvas-alt in dark. design_tokens_wiring.test.ts checks both against
    // the vendored tokens.
    { media: '(prefers-color-scheme: light)', color: '#f5f8f8' },
    { media: '(prefers-color-scheme: dark)', color: '#0c2227' },
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
      <head>
        <ThemeScript nonce={nonce} />
      </head>
      <body>
        <I18nProvider locale={locale} messages={messages}>
          <AppProviders>{children}</AppProviders>
        </I18nProvider>
      </body>
    </html>
  );
}
