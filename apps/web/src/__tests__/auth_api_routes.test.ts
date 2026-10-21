import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as postSignUp } from '@/app/api/v1/auth/sign-up/route';
import { POST as postSignIn } from '@/app/api/v1/auth/sign-in/route';
import { POST as postSignOut } from '@/app/api/v1/auth/sign-out/route';
import { POST as postRequestReset } from '@/app/api/v1/auth/request-password-reset/route';
import { POST as postResetPassword } from '@/app/api/v1/auth/reset-password/route';
import { POST as postVerifyEmail, GET as getVerifyEmail } from '@/app/api/v1/auth/verify-email/route';
import { POST as postReauthenticate } from '@/app/api/v1/auth/reauthenticate/route';
import { GET as getSession } from '@/app/api/v1/auth/session/route';
import { UnauthorizedError, ForbiddenError, ValidationError } from '@/server/domain/errors/domain_error';

const mockAuthService = vi.hoisted(() => ({
  signUp: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  verifyEmail: vi.fn(),
  reauthenticate: vi.fn(),
  resolveSessionFromToken: vi.fn(),
}));

vi.mock('@/server/container', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/container')>();
  return {
    ...actual,
    getJwtAuthService: () => mockAuthService,
  };
});

function createJsonRequest(url: string, method: string, body?: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, {
    method,
    headers: {
      'content-type': 'application/json',
      origin: 'https://app.sineva.id',
      host: 'app.sineva.id',
      'x-sineva-action': '1',
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('Auth API Routes (/api/v1/auth/*, WP-M0-23)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/v1/auth/sign-up', () => {
    it('creates user and returns 201 on valid input', async () => {
      mockAuthService.signUp.mockResolvedValue({
        user: { id: 'usr-123', email: 'budi@example.com', name: 'Budi' },
      });

      const req = createJsonRequest('https://app.sineva.id/api/v1/auth/sign-up', 'POST', {
        email: 'budi@example.com',
        password: 'validPassword12345',
        full_name: 'Budi Santoso',
        terms_accepted_version: 'v1.0',
        privacy_accepted_version: 'v1.0',
      });

      const res = await postSignUp(req);
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.status).toBe(201);
      expect(json.data.user.id).toBe('usr-123');
      expect(mockAuthService.signUp).toHaveBeenCalled();
    });

    it('returns 422 when password is shorter than 12 characters', async () => {
      const req = createJsonRequest('https://app.sineva.id/api/v1/auth/sign-up', 'POST', {
        email: 'budi@example.com',
        password: 'short',
        full_name: 'Budi Santoso',
        terms_accepted_version: 'v1.0',
        privacy_accepted_version: 'v1.0',
      });

      const res = await postSignUp(req);
      const json = await res.json();

      expect(res.status).toBe(422);
      expect(json.code).toBe('validation_failed');
      expect(mockAuthService.signUp).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/auth/sign-in', () => {
    it('returns 200 and sets httpOnly session cookie on successful credentials', async () => {
      const freshUntil = new Date(Date.now() + 900000);
      const expiresAt = new Date(Date.now() + 14 * 86400000);

      mockAuthService.signIn.mockResolvedValue({
        user: { id: 'usr-123', email: 'budi@example.com', name: 'Budi', email_verified: true },
        session: { id: 'sess-123', token: 'jwt.token.value', fresh_until: freshUntil, expires_at: expiresAt },
      });

      const req = createJsonRequest('https://app.sineva.id/api/v1/auth/sign-in', 'POST', {
        email: 'budi@example.com',
        password: 'validPassword123',
      });

      const res = await postSignIn(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.user.id).toBe('usr-123');

      // Verify cookie
      const cookieHeader = res.headers.get('set-cookie');
      expect(cookieHeader).toContain('sineva_session=jwt.token.value');
      expect(cookieHeader).toContain('HttpOnly');
      expect(cookieHeader?.toLowerCase()).toContain('samesite=lax');
    });

    it('returns 401 when password is invalid', async () => {
      mockAuthService.signIn.mockRejectedValue(new UnauthorizedError('Invalid email or password.'));

      const req = createJsonRequest('https://app.sineva.id/api/v1/auth/sign-in', 'POST', {
        email: 'budi@example.com',
        password: 'wrongPassword',
      });

      const res = await postSignIn(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.code).toBe('unauthenticated');
    });

    it('returns 403 when account is locked out', async () => {
      mockAuthService.signIn.mockRejectedValue(new ForbiddenError('Too many tries. You can try again in 15 minutes.'));

      const req = createJsonRequest('https://app.sineva.id/api/v1/auth/sign-in', 'POST', {
        email: 'budi@example.com',
        password: 'wrongPassword',
      });

      const res = await postSignIn(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.code).toBe('forbidden');
    });
  });

  describe('POST /api/v1/auth/sign-out', () => {
    it('calls signOut and clears session cookie', async () => {
      mockAuthService.signOut.mockResolvedValue(undefined);

      const req = createJsonRequest('https://app.sineva.id/api/v1/auth/sign-out', 'POST', undefined, {
        cookie: 'sineva_session=active-jwt-token',
      });

      const res = await postSignOut(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.success).toBe(true);
      expect(mockAuthService.signOut).toHaveBeenCalledWith('active-jwt-token');

      // Cleared cookie has Max-Age=0
      const cookieHeader = res.headers.get('set-cookie');
      expect(cookieHeader).toContain('sineva_session=;');
      expect(cookieHeader).toContain('Max-Age=0');
    });
  });

  describe('POST /api/v1/auth/request-password-reset', () => {
    it('returns 200 with non-enumerating message', async () => {
      mockAuthService.requestPasswordReset.mockResolvedValue({
        message: 'If this email is registered, we have sent a password reset link.',
      });

      const req = createJsonRequest('https://app.sineva.id/api/v1/auth/request-password-reset', 'POST', {
        email: 'budi@example.com',
      });

      const res = await postRequestReset(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.message).toContain('If this email is registered');
    });
  });

  describe('POST /api/v1/auth/reset-password', () => {
    it('returns 200 on valid reset token and new password', async () => {
      mockAuthService.resetPassword.mockResolvedValue({
        success: true,
        user_id: 'usr-123',
      });

      const req = createJsonRequest('https://app.sineva.id/api/v1/auth/reset-password', 'POST', {
        token: 'valid-reset-token',
        new_password: 'brandNewPassword123!',
      });

      const res = await postResetPassword(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.success).toBe(true);
    });

    it('returns 422 when reset token is invalid or expired', async () => {
      mockAuthService.resetPassword.mockRejectedValue(
        new ValidationError('Invalid or expired reset token.', [
          { code: 'invalid_token', field: 'token', detail: 'Token is expired or invalid' },
        ]),
      );

      const req = createJsonRequest('https://app.sineva.id/api/v1/auth/reset-password', 'POST', {
        token: 'expired-token',
        new_password: 'brandNewPassword123!',
      });

      const res = await postResetPassword(req);
      const json = await res.json();

      expect(res.status).toBe(422);
      expect(json.code).toBe('validation_failed');
    });
  });

  describe('POST /api/v1/auth/verify-email', () => {
    it('returns 200 when email is verified successfully', async () => {
      mockAuthService.verifyEmail.mockResolvedValue({
        verified: true,
        user_id: 'usr-123',
        email: 'budi@example.com',
      });

      const req = createJsonRequest('https://app.sineva.id/api/v1/auth/verify-email', 'POST', {
        token: 'valid-verify-token',
      });

      const res = await postVerifyEmail(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.verified).toBe(true);
    });

    it('supports GET with query parameter token', async () => {
      mockAuthService.verifyEmail.mockResolvedValue({
        verified: true,
        user_id: 'usr-123',
        email: 'budi@example.com',
      });

      const req = new NextRequest('https://app.sineva.id/api/v1/auth/verify-email?token=valid-query-token');
      const res = await getVerifyEmail(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.verified).toBe(true);
      expect(mockAuthService.verifyEmail).toHaveBeenCalledWith({ token: 'valid-query-token' });
    });
  });

  describe('POST /api/v1/auth/reauthenticate', () => {
    it('returns 200 and updates cookie with refreshed token', async () => {
      const freshUntil = new Date(Date.now() + 900000);
      mockAuthService.reauthenticate.mockResolvedValue({
        refreshed_token: 'refreshed.jwt.token',
        fresh_until: freshUntil,
      });

      const req = createJsonRequest(
        'https://app.sineva.id/api/v1/auth/reauthenticate',
        'POST',
        { password: 'confirmPassword123' },
        {
          'x-test-session-user-id': 'usr-123',
        },
      );

      const res = await postReauthenticate(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.fresh_until).toBeTruthy();

      const cookieHeader = res.headers.get('set-cookie');
      expect(cookieHeader).toContain('sineva_session=refreshed.jwt.token');
    });
  });

  describe('GET /api/v1/auth/session', () => {
    it('returns session information when authenticated', async () => {
      const req = new NextRequest('https://app.sineva.id/api/v1/auth/session', {
        headers: {
          'x-test-session-user-id': 'usr-abc',
          'x-test-session-role': 'admin',
          'x-test-session-workspaces': 'ws-1,ws-2',
        },
      });

      const res = await getSession(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.data.user_id).toBe('usr-abc');
      expect(json.data.role).toBe('admin');
      expect(json.data.memberships).toHaveLength(2);
    });

    it('returns 401 when unauthenticated', async () => {
      const req = new NextRequest('https://app.sineva.id/api/v1/auth/session', {
        headers: {
          'x-test-unauthenticated': 'true',
        },
      });

      const res = await getSession(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.code).toBe('unauthenticated');
    });
  });
});
