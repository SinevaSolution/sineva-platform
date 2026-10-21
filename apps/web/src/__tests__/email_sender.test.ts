import { describe, expect, it } from 'vitest';
import { FakeEmailSender } from '@/server/infrastructure/email/fake_email_sender';
import { SmtpEmailSender } from '@/server/infrastructure/email/smtp_email_sender';
import { DependencyUnavailableError } from '@/server/domain/errors/domain_error';
import { renderEmailTemplate } from '@/server/application/email/templates';

describe('EmailSender Port & Adapters (WP-M0-24, FR-INBOX-29)', () => {
  it('FakeEmailSender records sent emails and returns them', async () => {
    const sender = new FakeEmailSender(renderEmailTemplate);
    expect(sender.getSentEmails()).toHaveLength(0);

    await sender.send({
      to: 'user@example.com',
      template: 'verify_email',
      locale: 'en',
      params: {
        url: 'https://app.sineva.id/verify?token=123',
        recipient_name: 'Alice',
      },
    });

    const sent = sender.getSentEmails();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe('user@example.com');
    expect(sent[0]?.template).toBe('verify_email');
    expect(sent[0]?.locale).toBe('en');
    expect(sent[0]?.rendered.subject).toContain('Sineva');
    expect(sent[0]?.rendered.text).toContain('https://app.sineva.id/verify?token=123');
  });

  it('FakeEmailSender honors idempotency_key to prevent duplicate sends', async () => {
    const sender = new FakeEmailSender();

    await sender.send({
      to: 'user@example.com',
      template: 'verify_email',
      locale: 'en',
      params: { url: 'https://app.sineva.id/verify?token=123' },
      idempotency_key: 'idem-key-001',
    });

    // Re-sending with the exact same idempotency_key should be a no-op
    await sender.send({
      to: 'user@example.com',
      template: 'verify_email',
      locale: 'en',
      params: { url: 'https://app.sineva.id/verify?token=123' },
      idempotency_key: 'idem-key-001',
    });

    expect(sender.getSentEmails()).toHaveLength(1);
  });

  it('FakeEmailSender clear() resets the sent list and keys', async () => {
    const sender = new FakeEmailSender();
    await sender.send({
      to: 'user@example.com',
      template: 'lockout_notice',
      locale: 'id',
      params: { lockout_duration_minutes: 15 },
    });
    expect(sender.getSentEmails()).toHaveLength(1);

    sender.clear();
    expect(sender.getSentEmails()).toHaveLength(0);
  });

  it('SmtpEmailSender throws DependencyUnavailableError when SMTP fails or is misconfigured', async () => {
    // SmtpEmailSender configured with unreachable host
    const sender = new SmtpEmailSender({
      host: '127.0.0.1',
      port: 65534, // unreachable port
      from: 'Sineva <noreply@sineva.id>',
      connectionTimeoutMs: 100,
    });

    await expect(
      sender.send({
        to: 'user@example.com',
        template: 'reset_password',
        locale: 'en',
        params: { url: 'https://app.sineva.id/reset?token=999' },
      }),
    ).rejects.toThrow(DependencyUnavailableError);
  });

  it('DependencyUnavailableError thrown has status 503 and code dependency_unavailable', async () => {
    const sender = new SmtpEmailSender({
      host: '127.0.0.1',
      port: 65534,
      from: 'Sineva <noreply@sineva.id>',
      connectionTimeoutMs: 100,
    });

    try {
      await sender.send({
        to: 'user@example.com',
        template: 'reset_password',
        locale: 'en',
        params: { url: 'https://app.sineva.id/reset?token=999' },
      });
      expect.fail('Should have thrown DependencyUnavailableError');
    } catch (err) {
      expect(err).toBeInstanceOf(DependencyUnavailableError);
      const depErr = err as DependencyUnavailableError;
      expect(depErr.status).toBe(503);
      expect(depErr.code).toBe('dependency_unavailable');
    }
  });
});
