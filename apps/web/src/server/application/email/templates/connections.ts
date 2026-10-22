import type { ConnectionNeedsReconnectParams, EmailLocale } from '@/server/domain/email/email_sender';
import type { LocaleTemplateMap } from './index';

// Sent when a connected tool stops working and needs a new sign-in (WP-M2-15).
// The provider name and the person's name are escaped, and the only link is the
// workspace's Connected tools page, so the mail carries no credential and no
// code. Plain words only: no "token", "API" or other technical terms.

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function page(body: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; line-height: 1.6; color: #1e293b; max-width: 560px; margin: 0 auto; padding: 24px;">
${body}
</body>
</html>`;
}

function button(url: string, label: string): string {
  return `  <p style="margin: 24px 0;">
    <a href="${escapeHtml(url)}" style="background-color: #0d9488; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; display: inline-block;">
      ${escapeHtml(label)}
    </a>
  </p>`;
}

const COPY: Record<
  EmailLocale,
  {
    greeting: (name?: string) => string;
    subject: (provider: string) => string;
    lead: (provider: string) => string;
    action: string;
    cta: string;
    closing: string[];
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
  },
  id: {
    greeting: (name) => (name ? `Halo ${name},` : 'Halo,'),
    subject: (provider) => `${provider} perlu dihubungkan ulang di Sineva`,
    lead: (provider) =>
      `Sineva tidak bisa lagi memakai ${provider}. Sambungannya sudah kedaluwarsa atau dimatikan di sana.`,
    action: 'Hubungkan ulang supaya kamu dan para Spesialis bisa memakainya lagi. Tidak ada yang berubah selama ini.',
    cta: 'Hubungkan ulang',
    closing: ['Salam hangat,', 'Tim Sineva'],
  },
};

function render(locale: EmailLocale, { recipient_name, provider_name, url }: ConnectionNeedsReconnectParams) {
  const copy = COPY[locale];
  const greeting = copy.greeting(recipient_name);
  const text = [greeting, '', copy.lead(provider_name), copy.action, url, '', ...copy.closing].join('\n');
  const html = page(`  <p>${escapeHtml(greeting)}</p>
  <p>${escapeHtml(copy.lead(provider_name))}</p>
  <p>${escapeHtml(copy.action)}</p>
${button(url, copy.cta)}
  <p>${escapeHtml(copy.closing[0]!)}<br>${escapeHtml(copy.closing[1]!)}</p>`);
  return { subject: copy.subject(provider_name), text, html };
}

export const connectionNeedsReconnectTemplates: LocaleTemplateMap<ConnectionNeedsReconnectParams> = {
  en: { render: (params) => render('en', params) },
  id: { render: (params) => render('id', params) },
};
