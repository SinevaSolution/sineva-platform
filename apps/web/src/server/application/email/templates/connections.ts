import type { ConnectionNeedsReconnectParams, EmailLocale } from '@/server/domain/email/email_sender';
import type { LocaleTemplateMap } from './index';
import { renderLayout } from './layout';

// Sent when a connected tool stops working and needs a new sign-in (WP-M2-15).
// It uses the shared Sineva layout, which escapes the provider and person names; and the only link is the
// workspace's Connected tools page, so the mail carries no credential and no
// code. Plain words only: no "token", "API" or other technical terms.

const COPY: Record<
  EmailLocale,
  {
    greeting: (name?: string) => string;
    subject: (provider: string) => string;
    lead: (provider: string) => string;
    action: string;
    cta: string;
    closing: string[];
    preheader: (provider: string) => string;
    linkLead: string;
    reason: string;
  }
> = {
  en: {
    greeting: (name) => (name ? `Hello ${name},` : 'Hello,'),
    subject: (provider) => `${provider} needs to be reconnected on Sineva`,
    lead: (provider) =>
      `Sineva can no longer use ${provider}. The connection expired or was turned off there.`,
    action: 'Reconnect it so your specialists can use it again. Nothing was changed in the meantime.',
    cta: 'Reconnect',
    closing: ['Warm regards,', 'The Sineva Team'],
    preheader: (provider) => `${provider} stopped working for your specialists. Reconnecting takes a minute.`,
    linkLead: 'If the button does not work, paste this link into your browser:',
    reason: 'You are receiving this because you manage connected tools in a Sineva workspace.',
  },
  id: {
    greeting: (name) => (name ? `Halo ${name},` : 'Halo,'),
    subject: (provider) => `${provider} perlu dihubungkan ulang di Sineva`,
    lead: (provider) =>
      `Sineva tidak bisa lagi memakai ${provider}. Sambungannya sudah kedaluwarsa atau dimatikan di sana.`,
    action: 'Hubungkan ulang supaya kamu dan para Spesialis bisa memakainya lagi. Tidak ada yang berubah selama ini.',
    cta: 'Hubungkan ulang',
    closing: ['Salam hangat,', 'Tim Sineva'],
    preheader: (provider) => `${provider} berhenti bekerja untuk para Spesialis. Menghubungkan ulang hanya butuh semenit.`,
    linkLead: 'Kalau tombolnya tidak berfungsi, salin tautan ini ke browser kamu:',
    reason: 'Kamu menerima email ini karena kamu mengelola aplikasi terhubung di workspace Sineva.',
  },
};

function render(locale: EmailLocale, { recipient_name, provider_name, url }: ConnectionNeedsReconnectParams) {
  const copy = COPY[locale];
  const { html, text } = renderLayout({
    locale,
    appUrl: url,
    preheader: copy.preheader(provider_name),
    greeting: copy.greeting(recipient_name),
    heading: copy.subject(provider_name),
    paragraphs: [[copy.lead(provider_name)], [copy.action]],
    button: { label: copy.cta, url },
    linkLead: copy.linkLead,
    signoff: copy.closing,
    reason: copy.reason,
  });
  return { subject: copy.subject(provider_name), text, html };
}

export const connectionNeedsReconnectTemplates: LocaleTemplateMap<ConnectionNeedsReconnectParams> = {
  en: { render: (params) => render('en', params) },
  id: { render: (params) => render('id', params) },
};
