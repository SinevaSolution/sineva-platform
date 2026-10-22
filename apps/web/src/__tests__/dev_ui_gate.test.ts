import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxyPageGuard } from '@/proxy';
import Page from '@/app/dev/ui/page';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('@/client/components/dev_ui/gallery', () => ({ ComponentGallery: () => null }));

afterEach(() => vi.unstubAllEnvs());

describe('WP-M0-41 dev gallery gate', () => {
  it('returns 404 before auth redirects in production without ENABLE_DEV_UI=1', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ENABLE_DEV_UI', '');
    expect(proxyPageGuard(new NextRequest('https://sineva.id/dev/ui'))?.status).toBe(404);
    expect(proxyPageGuard(new NextRequest('https://sineva.id/dev/ui/patterns/auth'))?.status).toBe(
      404,
    );
  });
  it('allows fixture-only gallery requests in development without a user session', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(proxyPageGuard(new NextRequest('http://localhost/dev/ui'))).toBeNull();
  });
  it('requires the exact production opt-in value and retains auth for other pages', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ENABLE_DEV_UI', 'true');
    expect(proxyPageGuard(new NextRequest('https://sineva.id/dev/ui'))?.status).toBe(404);
    vi.stubEnv('ENABLE_DEV_UI', '1');
    expect(proxyPageGuard(new NextRequest('https://sineva.id/dev/ui'))).toBeNull();
    expect(proxyPageGuard(new NextRequest('https://sineva.id/account'))?.status).toBe(307);
    expect(proxyPageGuard(new NextRequest('https://sineva.id/dev/ui-private'))?.status).toBe(307);
  });
});

it('enforces the gate inside the page even when the proxy is bypassed', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('ENABLE_DEV_UI', '');
  await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_NOT_FOUND');
});

it('allows only supported locale, theme and width values into the gallery', async () => {
  vi.stubEnv('NODE_ENV', 'development');
  const page = await Page({
    searchParams: Promise.resolve({
      locale: 'xx',
      theme: 'custom-css',
      width: '999999',
      pseudo: '1',
    }),
  });
  expect(page.props).toMatchObject({ locale: 'en', theme: 'light', width: 1440, pseudo: true });
});
