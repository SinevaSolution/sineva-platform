import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { isLinkNextPath } from '@/server/domain/auth/next_path';
import { JwtAuthService } from '@/server/infrastructure/auth/jwt_auth_service';
import { FakeEmailSender } from '@/server/infrastructure/email/fake_email_sender';
import { CountingAuditLogger } from '@/server/domain/audit/audit_logger';
import { FakeBreachedPasswordChecker } from '@/server/domain/auth/breached_password_checker';
import type { PrismaClient } from '@/server/infrastructure/database/generated/client';

const TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ-_';

describe('isLinkNextPath: the only post sign-up destinations a client may name', () => {
  it('accepts invitation and ownership links', () => {
    expect(isLinkNextPath(`/invite/${TOKEN}`)).toBe(true);
    expect(isLinkNextPath(`/ownership/${TOKEN}`)).toBe(true);
  });

  it.each([
    'https://evil.test/invite/' + TOKEN,
    '//evil.test/invite/' + TOKEN,
    `/invite/${TOKEN}/../../admin`,
    `/invite/${TOKEN}?x=1`,
    '/invite/short',
    '/settings',
    '/',
    '/invite/ab cd',
    `/invite/${TOKEN}\\evil`,
    '',
  ])('rejects %s', (value) => {
    expect(isLinkNextPath(value)).toBe(false);
  });
});

describe('sign-up keeps the invitation link through email verification (FR-AUTH-16)', () => {
  function build() {
    const mockPrisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...data, id: 'usr-new-1' })),
      },
      account: { create: vi.fn().mockResolvedValue({ id: 'acc-1' }) },
      verification: { create: vi.fn().mockResolvedValue({ id: 'ver-1' }) },
      $transaction: vi.fn().mockImplementation((callback) => callback(mockPrisma)),
    };
    const emails = new FakeEmailSender();
    const service = new JwtAuthService({
      prisma: mockPrisma as unknown as PrismaClient,
      emailSender: emails,
      auditLogger: new CountingAuditLogger(),
      breachedChecker: new FakeBreachedPasswordChecker([]),
      authSecret: 'super-secret-auth-key-32-chars-long-test!',
      appUrl: 'https://app.sineva.test',
    });
    return { service, emails };
  }

  const input = {
    email: 'new@acme.test',
    password: 'a-long-enough-pass-1',
    full_name: 'New Person',
    terms_accepted_version: 'v1',
    privacy_accepted_version: 'v1',
  };

  it('appends next to the verification link when it is an invitation path', async () => {
    const { service, emails } = build();
    await service.signUp({ ...input, next: `/invite/${TOKEN}` });
    const url = String(emails.getLastEmail()!.params.url);
    expect(url).toMatch(/^https:\/\/app\.sineva\.test\/verify-email\?token=[0-9a-f]+&next=%2Finvite%2F/);
    expect(new URL(url).searchParams.get('next')).toBe(`/invite/${TOKEN}`);
  });

  it('keeps the plain verification link without next', async () => {
    const { service, emails } = build();
    await service.signUp(input);
    expect(String(emails.getLastEmail()!.params.url)).not.toContain('next=');
  });

  it('ignores a next that is not an invitation or ownership path instead of redirecting anywhere', async () => {
    const { service, emails } = build();
    await service.signUp({ ...input, next: 'https://evil.test/' });
    expect(String(emails.getLastEmail()!.params.url)).not.toContain('next=');
  });
});

describe('POST /api/v1/auth/sign-up accepts next', () => {
  it('rejects a next outside the allowed shapes with 422', async () => {
    const { POST } = await import('@/app/api/v1/auth/sign-up/route');
    const res = await POST(
      new NextRequest('https://app.sineva.id/api/v1/auth/sign-up', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-sineva-action': '1', origin: 'https://app.sineva.id' },
        body: JSON.stringify({
          email: 'new@acme.test',
          password: 'a-long-enough-pass-1',
          full_name: 'New Person',
          terms_accepted_version: 'v1',
          privacy_accepted_version: 'v1',
          next: 'https://evil.test/',
        }),
      }),
    );
    expect(res.status).toBe(422);
  });
});
