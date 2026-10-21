import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Geist_Mono } from 'next/font/google';
import { AppProviders } from '@/client/store/provider';
import './globals.css';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  display: 'swap',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Sineva Platform — Unified AI Companion Workspace & BFF',
  description:
    'Warm, human-centered enterprise AI companion platform orchestrating @SinoPeople, @SinoFinance, @SinoSales, @SinoSocial, @SinoHelp, and @SinoInsights.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plusJakartaSans.variable} ${geistMono.variable}`}
    >
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
