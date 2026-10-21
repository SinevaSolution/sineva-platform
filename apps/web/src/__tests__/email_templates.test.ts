import { describe, expect, it } from 'vitest';
import {
  EMAIL_TEMPLATES,
  renderEmailTemplate,
  type EmailLocale,
  type EmailTemplateName,
} from '@/server/application/email/templates';

describe('Email Templates (WP-M0-24, FR-AUTH-03, FR-AUTH-04, FR-AUTH-05, FR-UX-36)', () => {
  const LOCALES: EmailLocale[] = ['en', 'id'];
  const TEMPLATES: EmailTemplateName[] = [
    'verify_email',
    'reset_password',
    'lockout_notice',
    'email_change_confirm',
    'email_change_notice',
  ];

  const SAMPLE_PARAMS: Record<EmailTemplateName, Record<string, unknown>> = {
    verify_email: {
      recipient_name: 'Budi',
      url: 'https://app.sineva.ai/verify?token=abc-123',
      expires_in_minutes: 30,
    },
    reset_password: {
      recipient_name: 'Budi',
      url: 'https://app.sineva.ai/reset?token=xyz-789',
      expires_in_minutes: 30,
    },
    lockout_notice: {
      recipient_name: 'Budi',
      lockout_duration_minutes: 15,
      attempt_time: '2026-10-21 14:00 UTC',
    },
    email_change_confirm: {
      recipient_name: 'Budi',
      new_email: 'budi.new@example.com',
      url: 'https://app.sineva.ai/confirm-email?token=change-456',
      expires_in_minutes: 30,
    },
    email_change_notice: {
      recipient_name: 'Budi',
      new_email: 'budi.new@example.com',
      revert_url: 'https://app.sineva.ai/support',
    },
  };

  it('provides all 5 required templates across both EN and ID locales (completeness FR-UX-37a)', () => {
    for (const template of TEMPLATES) {
      for (const locale of LOCALES) {
        expect(EMAIL_TEMPLATES[template]).toBeDefined();
        expect(EMAIL_TEMPLATES[template][locale]).toBeDefined();
        expect(typeof EMAIL_TEMPLATES[template][locale].render).toBe('function');
      }
    }
  });

  it('renders all templates without errors and includes key parameters', () => {
    for (const template of TEMPLATES) {
      for (const locale of LOCALES) {
        const params = SAMPLE_PARAMS[template];
        const rendered = renderEmailTemplate(template, locale, params);

        expect(rendered.subject).toBeTruthy();
        expect(rendered.text).toBeTruthy();
        expect(rendered.html).toBeTruthy();

        // Check params present
        if ('url' in params) {
          expect(rendered.text).toContain(params.url);
          expect(rendered.html).toContain(params.url);
        }
        if ('recipient_name' in params) {
          expect(rendered.text).toContain(params.recipient_name);
        }
      }
    }
  });

  it('strictly forbids em-dash (—) and en-dash (–) across all templates and locales', () => {
    for (const template of TEMPLATES) {
      for (const locale of LOCALES) {
        const rendered = renderEmailTemplate(template, locale, SAMPLE_PARAMS[template]);
        const allText = `${rendered.subject} ${rendered.text} ${rendered.html}`;
        expect(allText).not.toContain('—'); // em dash
        expect(allText).not.toContain('–'); // en dash
      }
    }
  });

  it('strictly forbids the words "agent" and "agen" (case-insensitive) across all templates', () => {
    const bannedPattern = /\b(agent|agents|agen)\b/i;
    for (const template of TEMPLATES) {
      for (const locale of LOCALES) {
        const rendered = renderEmailTemplate(template, locale, SAMPLE_PARAMS[template]);
        expect(rendered.subject).not.toMatch(bannedPattern);
        expect(rendered.text).not.toMatch(bannedPattern);
        expect(rendered.html).not.toMatch(bannedPattern);
      }
    }
  });

  it('uses warm "kamu" voice in Indonesian and NEVER uses stiff "Anda"', () => {
    const andaPattern = /\bAnda\b/;
    const kamuPattern = /\b(kamu|milikmu|mu)\b/i;

    for (const template of TEMPLATES) {
      const rendered = renderEmailTemplate(template, 'id', SAMPLE_PARAMS[template]);
      // Should not contain formal "Anda"
      expect(rendered.subject).not.toMatch(andaPattern);
      expect(rendered.text).not.toMatch(andaPattern);
      expect(rendered.html).not.toMatch(andaPattern);

      // Should contain warm "kamu" or "-mu"
      const content = `${rendered.subject} ${rendered.text}`;
      expect(content).toMatch(kamuPattern);
    }
  });

  it('verification and reset emails contain link only and workspace-free product name (Sineva)', () => {
    for (const t of ['verify_email', 'reset_password'] as const) {
      for (const locale of LOCALES) {
        const rendered = renderEmailTemplate(t, locale, SAMPLE_PARAMS[t]);
        // Contains product name Sineva
        expect(rendered.subject).toContain('Sineva');
        // Does not contain any workspace mention (workspace-free)
        expect(rendered.text.toLowerCase()).not.toContain('workspace');
        expect(rendered.text.toLowerCase()).not.toContain('ruang kerja');
      }
    }
  });
});
