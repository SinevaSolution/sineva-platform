// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextRequest } from 'next/server';
import { proxyPageGuard } from '@/proxy';
import { LinkAcceptance } from '@/client/components/members/link_acceptance';
import { I18nProvider } from '@/i18n/provider';
import { CATALOGS } from '@/i18n/catalogs';
const api = vi.hoisted(() => vi.fn());
const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock('@/client/lib/api', async (original) => ({
  ...(await original<typeof import('@/client/lib/api')>()),
  apiRequest: api,
}));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const preview = {
  state: 'pending' as const,
  workspace_name: 'Acme',
  inviter_first_name: 'Sam',
  role: 'member' as const,
  expires_at: '2026-10-29T10:00:00Z',
  email_matches_session: true,
};
function setup(patch = {}) {
  return render(
    <I18nProvider locale="en" messages={CATALOGS.en}>
      <LinkAcceptance kind="invite" token="abcdefghijklmnop" preview={{ ...preview, ...patch }} />
    </I18nProvider>,
  );
}
describe('invitation links', () => {
  it.each(['/invite/abcdefghijklmnop', '/ownership/abcdefghijklmnop'])(
    'opens %s signed out',
    (path) => {
      expect(proxyPageGuard(new NextRequest(`http://localhost:3001${path}`))).toBeNull();
    },
  );
  it('keeps other invitation-shaped paths protected', () => {
    expect(proxyPageGuard(new NextRequest('http://localhost:3001/invite/a/secret'))?.status).toBe(
      307,
    );
  });
  it('accepts only on explicit action and navigates to the returned workspace', async () => {
    api.mockResolvedValue({ workspace: { workspace_slug: 'acme' } });
    setup();
    expect(api).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Join workspace' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/w/acme'));
    expect(api).toHaveBeenCalledWith('/api/v1/invitations/abcdefghijklmnop/accept', {
      method: 'POST',
    });
  });
  it('offers sign in and sign up with the invitation return path', () => {
    setup({ email_matches_session: null });
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe(
      '/sign-in?next=%2Finvite%2Fabcdefghijklmnop',
    );
    expect(screen.getByRole('link', { name: 'Create account' }).getAttribute('href')).toBe(
      '/sign-up?next=%2Finvite%2Fabcdefghijklmnop',
    );
  });
  it('refuses acceptance for an expired link or a mismatched account', () => {
    const view = setup({ state: 'expired' });
    expect(screen.queryByRole('button', { name: 'Join workspace' })).toBeNull();
    view.unmount();
    setup({ email_matches_session: false });
    expect(screen.queryByRole('button', { name: 'Join workspace' })).toBeNull();
  });
});
