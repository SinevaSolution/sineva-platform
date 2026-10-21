import 'server-only';
import type { NextResponse, NextRequest } from 'next/server';

export const SESSION_COOKIE_NAME = 'sineva_session';
export const SESSION_MAX_AGE_SECONDS = 14 * 24 * 60 * 60; // 14 days

export function setSessionCookie(
  response: NextResponse,
  token: string,
  maxAgeSeconds: number = SESSION_MAX_AGE_SECONDS,
): void {
  const isProduction = process.env.NODE_ENV === 'production';
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  const isProduction = process.env.NODE_ENV === 'production';
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export function getSessionToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
}
