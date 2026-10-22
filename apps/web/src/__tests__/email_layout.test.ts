import { describe, expect, it } from 'vitest';
import {
  EMAIL_TEMPLATES,
  renderEmailTemplate,
  type EmailLocale,
  type EmailTemplateName,
} from '@/server/application/email/templates';
import { escapeHtml, originOf, renderLayout } from '@/server/application/email/templates/layout';

const APP = 'https://app.sineva.id';

const SAMPLES: Record<EmailTemplateName, Record<string, unknown>> = {
  connection_needs_reconnect: {
    recipient_name: 'Budi',
    provider_name: 'Google Calendar',
    url: `${APP}/w/kopi-senja/tools`,
  },
  verify_email: {
    recipient_name: 'Budi',
    url: `${APP}/verify-email?token=a&next=%2Finvite%2Fx`,
    expires_in_minutes: 30,
  },
  reset_password: {
    recipient_name: 'Budi',
    url: `${APP}/reset-password?token=b`,
    expires_in_minutes: 30,
  },
  lockout_notice: {
    recipient_name: 'Budi',
    lockout_duration_minutes: 15,
    attempt_time: '2026-10-21 14:00 UTC',
    app_url: APP,
  },
  email_change_confirm: {
    recipient_name: 'Budi',
    new_email: 'new@example.com',
    url: `${APP}/confirm?token=c`,
    expires_in_minutes: 30,
  },
  email_change_notice: {
    recipient_name: 'Budi',
    new_email: 'new@example.com',
    revert_url: `${APP}/support`,
    app_url: APP,
  },
  workspace_invitation: {
    url: `${APP}/invite/abcdefghijklmnop`,
    workspace_name: 'Warung Sari',
    inviter_name: 'Sari',
    role: 'member',
    expires_in_days: 7,
  },
  ownership_transfer_request: {
    recipient_name: 'Budi',
    url: `${APP}/ownership/abcdefghijklmnop`,
    workspace_name: 'Warung Sari',
    from_name: 'Sari',
    expires_in_days: 7,
  },
  ownership_transferred_notice: {
    recipient_name: 'Budi',
    workspace_name: 'Warung Sari',
    other_name: 'Sari',
    new_role: 'owner',
    app_url: APP,
  },
};

const TEMPLATES = Object.keys(SAMPLES) as EmailTemplateName[];
const LOCALES: EmailLocale[] = ['en', 'id'];

describe.each(TEMPLATES.flatMap((t) => LOCALES.map((l) => [t, l] as const)))(
  'shared email layout: %s (%s)',
  (template, locale) => {
    const params = SAMPLES[template];
    const mail = renderEmailTemplate(template, locale, params);
    const link = (params.url ?? params.revert_url) as string | undefined;

    it('is table based, inline styled and 580 px at most', () => {
      expect(mail.html).toContain('role="presentation"');
      expect(mail.html).toContain('max-width:580px');
      expect(mail.html).not.toMatch(/<link\b/i);
      expect(mail.html).not.toMatch(/<script\b/i);
      expect(mail.html).not.toMatch(/@import|url\(http/i);
    });

    it('declares light and dark support and a system font stack with the brand face first', () => {
      expect(mail.html).toContain('<meta name="color-scheme" content="light dark">');
      expect(mail.html).toContain('<meta name="supported-color-schemes" content="light dark">');
      expect(mail.html).toContain('prefers-color-scheme: dark');
      expect(mail.html).toContain("'Plus Jakarta Sans', -apple-system");
    });

    it('has a hidden preheader that is not the subject', () => {
      const match = /<div style="display:none[^>]*>([^<]*)</.exec(mail.html);
      expect(match?.[1]?.trim().length ?? 0).toBeGreaterThan(10);
      expect(mail.html.indexOf('display:none')).toBeLessThan(mail.html.indexOf('<h1'));
    });

    it('carries the Sineva wordmark as text and Sino as a sized image with alt text and an absolute URL', () => {
      expect(mail.html).toContain('>Sineva</p>');
      const img = /<img [^>]*>/.exec(mail.html)?.[0] ?? '';
      expect(img).toContain(`src="${APP}/email/sino-wave.png"`);
      expect(img).toMatch(/width="120"/);
      expect(img).toMatch(/height="120"/);
      expect(img).toMatch(/alt="[^"]{5,}"/);
      // No tracking pixel: the only image is Sino.
      expect((mail.html.match(/<img /g) ?? []).length).toBe(1);
    });

    it('has a plain-text version with the link and the product footer', () => {
      if (link) expect(mail.text).toContain(link);
      expect(mail.text).toContain('Sineva · sineva.id');
      expect(mail.text.split('\n').length).toBeGreaterThan(5);
    });

    it('puts the same link in the button, the VML button and the visible fallback', () => {
      if (!link) return;
      const href = escapeHtml(link);
      expect(mail.html).toContain('v:roundrect');
      expect(
        (
          mail.html.match(
            new RegExp(`href="${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g'),
          ) ?? []
        ).length,
      ).toBeGreaterThanOrEqual(3);
    });

    it('has no dashes the copy rules forbid and no banned product words', () => {
      const all = `${mail.subject} ${mail.text} ${mail.html}`;
      expect(all).not.toMatch(/[–—]/);
      expect(all).not.toMatch(/\b(agent|agents|agen|bot|assistant)\b/i);
      if (locale === 'id') expect(all).not.toMatch(/\bAnda\b/);
    });
  },
);

describe('workspace invitation email', () => {
  const params = SAMPLES.workspace_invitation;

  it('says who invited, to what, the role in plain words, and what Sineva is (English)', () => {
    const mail = renderEmailTemplate('workspace_invitation', 'en', params);
    expect(mail.subject).toBe('Sari invited you to join Warung Sari on Sineva');
    expect(mail.html).toContain('Sari invited you to join Warung Sari on Sineva');
    expect(mail.text).toContain('Your role: Member');
    expect(mail.text).toMatch(/work with Sino/);
    expect(mail.text).toMatch(/Sineva .*Sino/);
    expect(mail.html).toContain('>Join Warung Sari</a>');
    expect(mail.text).toContain('Join Warung Sari');
    expect(mail.text).toContain('This invitation works for 7 days.');
    expect(mail.text).toMatch(/only works for the email address/);
    expect(mail.text).toMatch(/If you were not expecting this, you can ignore this email\./);
    expect(mail.text).toContain('You are receiving this because');
  });

  it('is the same in Indonesian with kamu', () => {
    const mail = renderEmailTemplate('workspace_invitation', 'id', params);
    expect(mail.subject).toBe('Sari mengundang kamu bergabung ke Warung Sari di Sineva');
    expect(mail.html).toContain('>Gabung ke Warung Sari</a>');
    expect(mail.text).toContain('Perananmu: Anggota');
    expect(mail.text).toContain('Undangan ini berlaku selama 7 hari.');
    expect(mail.text).toMatch(/hanya berlaku untuk alamat email/);
    expect(mail.text).toMatch(/abaikan saja email ini/);
    expect(mail.text).toMatch(/\bkamu\b/);
  });

  it.each(['admin', 'viewer'])('explains the %s role differently from member', (role) => {
    const member = renderEmailTemplate('workspace_invitation', 'en', params).text;
    const other = renderEmailTemplate('workspace_invitation', 'en', { ...params, role }).text;
    expect(other).not.toBe(member);
    expect(other).toContain(role === 'admin' ? 'Admin' : 'Viewer');
  });

  it('escapes the inviter and workspace names everywhere in the html', () => {
    const mail = renderEmailTemplate('workspace_invitation', 'en', {
      ...params,
      inviter_name: `<b>Evil</b> & "Co" 'x'`,
      workspace_name: '<img src=x onerror=alert(1)>',
    });
    expect(mail.html).not.toContain('<b>Evil');
    expect(mail.html).not.toContain('<img src=x');
    expect(mail.html).not.toContain('onerror=alert(1)>');
    expect(mail.html).toContain('&lt;b&gt;Evil&lt;/b&gt; &amp; &quot;Co&quot; &#39;x&#39;');
    expect(mail.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    // The one real image is still Sino.
    expect((mail.html.match(/<img /g) ?? []).length).toBe(1);
  });

  it('escapes a hostile link so it cannot break out of the attribute', () => {
    const mail = renderEmailTemplate('workspace_invitation', 'en', {
      ...params,
      url: `${APP}/invite/x" onmouseover="alert(1)`,
    });
    expect(mail.html).not.toContain('" onmouseover="');
  });
});

describe('layout helpers', () => {
  it('derives the app origin only from absolute http(s) URLs', () => {
    expect(originOf('https://app.sineva.id/invite/x?y=1')).toBe('https://app.sineva.id');
    expect(originOf('javascript:alert(1)')).toBeUndefined();
    expect(originOf('/relative')).toBeUndefined();
    expect(originOf(undefined)).toBeUndefined();
  });

  it('leaves the image out when no app address is known, and the layout still holds', () => {
    const { html } = renderLayout({
      locale: 'en',
      preheader: 'Hello there, this is a preheader',
      heading: 'Heading',
      paragraphs: [['Body']],
      reason: 'Because.',
    });
    expect(html).not.toContain('<img');
    expect(html).toContain('>Sineva</p>');
  });

  it('every template renders in both locales from the registry', () => {
    for (const t of TEMPLATES) for (const l of LOCALES) expect(EMAIL_TEMPLATES[t][l]).toBeDefined();
  });
});
