import { beforeEach, describe, expect, it, vi } from 'vitest';

const createTransport = vi.hoisted(() => vi.fn<(options: unknown) => { sendMail: () => void }>(() => ({ sendMail: vi.fn() })));
vi.mock('nodemailer', () => ({ default: { createTransport }, createTransport }));

import { SmtpEmailSender } from '@/server/infrastructure/email/smtp_email_sender';

function transportOptions(port: number, secure?: boolean) {
  createTransport.mockClear();
  new SmtpEmailSender({ host: 'smtp.example.test', port, secure, from: 'Sineva <noreply@sineva.id>' });
  return createTransport.mock.calls[0]?.[0] as { port: number; secure: boolean };
}

// EMAIL_SERVER_PORT=465 is SMTPS: TLS from the first byte. nodemailer needs
// secure: true there, or it speaks plain text to a TLS port and hangs. 587
// and 25 start plain and upgrade with STARTTLS, so secure must be false.
describe('SMTP transport security follows the port', () => {
  beforeEach(() => createTransport.mockClear());

  it('uses implicit TLS on 465', () => {
    expect(transportOptions(465)).toMatchObject({ port: 465, secure: true });
  });

  it('uses STARTTLS (secure false) on 587 and 25', () => {
    expect(transportOptions(587).secure).toBe(false);
    expect(transportOptions(25).secure).toBe(false);
  });

  it('lets an explicit setting win', () => {
    expect(transportOptions(2465, true).secure).toBe(true);
  });
});
