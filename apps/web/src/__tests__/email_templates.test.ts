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
    'workspace_invitation',
    'ownership_transfer_request',
    'ownership_transferred_notice',
    'connection_needs_reconnect',
  ];

  const SAMPLE_PARAMS: Record<EmailTemplateName, Record<string, unknown>> = {
    verify_email: {
      recipient_name: 'Budi',
      url: 'https://app.sineva.id/verify?token=abc-123',
      expires_in_minutes: 30,
    },
    reset_password: {
      recipient_name: 'Budi',
      url: 'https://app.sineva.id/reset?token=xyz-789',
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
      url: 'https://app.sineva.id/confirm-email?token=change-456',
      expires_in_minutes: 30,
    },
    email_change_notice: {
      recipient_name: 'Budi',
      new_email: 'budi.new@example.com',
      revert_url: 'https://app.sineva.id/support',
    },
    workspace_invitation: {
      url: 'https://app.sineva.id/invite/tok-abc',
      workspace_name: 'Warung Sari',
      inviter_name: 'Sari',
      role: 'member',
      expires_in_days: 7,
    },
    ownership_transfer_request: {
      recipient_name: 'Budi',
      url: 'https://app.sineva.id/ownership/tok-def',
      workspace_name: 'Warung Sari',
      from_name: 'Sari',
      expires_in_days: 7,
    },
    ownership_transferred_notice: {
      recipient_name: 'Budi',
      workspace_name: 'Warung Sari',
      other_name: 'Sari',
      new_role: 'owner',
    },
    connection_needs_reconnect: {
      recipient_name: 'Budi',
      provider_name: 'Google Calendar',
      url: 'https://app.sineva.id/w/warung-sari/connections',
    },
  };

  it('provides every required template across both EN and ID locales (completeness FR-UX-37a)', () => {
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

describe('Member invitation and ownership emails (WP-M1-28, FR-AUTH-14, FR-AUTH-16)', () => {
  it('invitation names the workspace, inviter and role in both languages and carries the link', () => {
    const params = {
      url: 'https://app.sineva.id/invite/tok-abc',
      workspace_name: 'Warung Sari',
      inviter_name: 'Sari',
      role: 'viewer',
      expires_in_days: 7,
    };
    const en = renderEmailTemplate('workspace_invitation', 'en', params);
    expect(en.subject).toContain('Warung Sari');
    expect(en.text).toContain('Viewer');
    expect(en.text).toContain('7 days');
    const id = renderEmailTemplate('workspace_invitation', 'id', params);
    expect(id.text).toContain('Peninjau');
    expect(id.text).toContain('7 hari');
    expect(id.html).toContain(params.url);
  });

  it('escapes user-controlled names in the html body', () => {
    const rendered = renderEmailTemplate('workspace_invitation', 'en', {
      url: 'https://app.sineva.id/invite/t',
      workspace_name: '<script>alert(1)</script>',
      inviter_name: 'A&B',
      role: 'member',
      expires_in_days: 7,
    });
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).toContain('A&amp;B');
  });
});
