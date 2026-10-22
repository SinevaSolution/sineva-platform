// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SNTooltipProvider } from '@sineva/ui';
import { MembersScreen } from '@/client/components/members/members_screen';
import { LinkAcceptance } from '@/client/components/members/link_acceptance';
import { ReauthDialog } from '@/client/components/auth/reauth_dialog';
import { SignInMethods } from '@/client/components/settings/sign_in_methods';
import { ApiError } from '@/client/lib/api';
import { savePendingReauth, takePendingReauth } from '@/client/lib/fresh_session';
import { I18nProvider } from '@/i18n/provider';
import { CATALOGS } from '@/i18n/catalogs';
import type { MemberView } from '@/shared/members_view';
import type { SignInMethodsView } from '@/shared/sign_in_methods_view';

const api = vi.hoisted(() => vi.fn());
const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('@/client/lib/api', async (original) => ({
  ...(await original<typeof import('@/client/lib/api')>()),
  apiRequest: api,
}));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@sineva/ui', async (original) => ({
  ...(await original<typeof import('@sineva/ui')>()),
  snToast: { ...toast, info: vi.fn(), warning: vi.fn(), message: vi.fn(), dismiss: vi.fn() },
}));

beforeAll(() => {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

beforeEach(() => window.sessionStorage.clear());
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const FRESH_REQUIRED = new ApiError('stale', 403, 'forbidden', ['fresh_session_required']);
const PLAIN_FORBIDDEN = new ApiError('no', 403, 'forbidden', []);

function shell(node: React.ReactNode, locale: 'en' | 'id' = 'en') {
  return render(
    <SNTooltipProvider>
      <I18nProvider locale={locale} messages={CATALOGS[locale]}>
        {node}
      </I18nProvider>
    </SNTooltipProvider>,
  );
}

const owner: MemberView = {
  id: 'm-1',
  display_name: 'Alice Owner',
  avatar_url: null,
  role: 'owner',
  job_title: null,
  department: null,
  status: 'active',
  is_you: true,
  joined_at: '2026-01-01T00:00:00Z',
  email: 'alice@example.com',
  last_active_at: null,
  specialist_scope: 'all',
  specialist_slugs: [],
};
const bob: MemberView = {
  ...owner,
  id: 'm-2',
  display_name: 'Bob Member',
  role: 'member',
  is_you: false,
  email: 'bob@example.com',
};

function members(reauthMethods: { has_password: boolean; providers: Array<'google' | 'github'> }, initialNotice?: string) {
  return shell(
    <MembersScreen
      workspaceId="ws-1"
      role="owner"
      members={[owner, bob]}
      invitations={[]}
      transfer={null}
      specialists={[]}
      reauthMethods={reauthMethods}
      initialNotice={initialNotice}
    />,
  );
}

async function pressRemove() {
  fireEvent.click(screen.getByRole('button', { name: 'Remove Bob Member' }));
  const dialog = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Remove member' }));
}

describe('fresh-session recovery on the members page', () => {
  it('asks to confirm with the password, then repeats the removal', async () => {
    api
      .mockRejectedValueOnce(FRESH_REQUIRED) // first DELETE: stale session
      .mockResolvedValueOnce({ fresh_until: 'x' }) // reauthenticate
      .mockResolvedValueOnce(null); // DELETE again
    members({ has_password: true, providers: [] });
    await pressRemove();

    const dialog = await screen.findByRole('dialog', { name: "Confirm it's you" });
    fireEvent.change(within(dialog).getByLabelText(/Password/), { target: { value: 'Password123!' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(api).toHaveBeenCalledTimes(3));
    expect(api.mock.calls[1]).toEqual([
      '/api/v1/auth/reauthenticate',
      { method: 'POST', body: { password: 'Password123!' } },
    ]);
    expect(api.mock.calls[2]?.[0]).toBe('/api/v1/workspaces/ws-1/members/m-2');
    expect(toast.success).toHaveBeenCalledWith('Bob Member was removed.');
  });

  it('does not open the dialog for an ordinary forbidden answer', async () => {
    api.mockRejectedValueOnce(PLAIN_FORBIDDEN);
    members({ has_password: true, providers: [] });
    await pressRemove();
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog', { name: "Confirm it's you" })).toBeNull();
  });

  it('says plainly when the password is wrong and keeps the dialog open', async () => {
    api
      .mockRejectedValueOnce(FRESH_REQUIRED)
      .mockRejectedValueOnce(new ApiError('Invalid password.', 401, 'unauthenticated'));
    members({ has_password: true, providers: [] });
    await pressRemove();
    const dialog = await screen.findByRole('dialog', { name: "Confirm it's you" });
    fireEvent.change(within(dialog).getByLabelText(/Password/), { target: { value: 'nope' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    expect(await within(dialog).findByText('That password is not right. Try again.')).toBeTruthy();
  });

  it('offers Google and no password field to someone who only signs in with Google', async () => {
    api.mockRejectedValueOnce(FRESH_REQUIRED);
    members({ has_password: false, providers: ['google'] });
    await pressRemove();
    const dialog = await screen.findByRole('dialog', { name: "Confirm it's you" });
    expect(within(dialog).queryByLabelText(/Password/)).toBeNull();
    const link = within(dialog).getByRole('link', { name: 'Continue with Google' });
    const url = new URL(link.getAttribute('href') ?? '', 'http://x');
    expect(url.pathname).toBe('/api/v1/auth/oauth/google');
    expect(url.searchParams.get('intent')).toBe('reauth');
    // It returns to this very page, not to the sign-in page.
    expect(url.searchParams.get('return_to')).toBe(window.location.pathname);

    // The removal waiting for the re-confirm is saved so it can finish on return.
    // jsdom cannot navigate; the handler under test has already run by then.
    link.addEventListener('click', (e) => e.preventDefault());
    fireEvent.click(link);
    expect(takePendingReauth()).toEqual({
      kind: 'remove_member',
      workspace_id: 'ws-1',
      member_id: 'm-2',
      label: 'Bob Member',
    });
  });

  it('offers both a provider and the password when the account has both', async () => {
    api.mockRejectedValueOnce(FRESH_REQUIRED);
    members({ has_password: true, providers: ['github'] });
    await pressRemove();
    const dialog = await screen.findByRole('dialog', { name: "Confirm it's you" });
    expect(within(dialog).getByRole('link', { name: 'Continue with GitHub' })).toBeTruthy();
    expect(within(dialog).getByLabelText(/Password/)).toBeTruthy();
  });

  it('finishes the removal when the person comes back from the provider', async () => {
    savePendingReauth({ kind: 'remove_member', workspace_id: 'ws-1', member_id: 'm-2', label: 'Bob Member' });
    api.mockResolvedValue(null);
    members({ has_password: false, providers: ['google'] }, 'reauthenticated');
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/api/v1/workspaces/ws-1/members/m-2', { method: 'DELETE' }),
    );
    expect(toast.success).toHaveBeenCalledWith('Bob Member was removed.');
    expect(takePendingReauth()).toBeNull();
  });

  it('ignores a saved action that belongs to another workspace', async () => {
    savePendingReauth({ kind: 'remove_member', workspace_id: 'other', member_id: 'm-2', label: 'Bob' });
    members({ has_password: false, providers: ['google'] }, 'reauthenticated');
    await new Promise((r) => setTimeout(r, 20));
    expect(api).not.toHaveBeenCalled();
  });

  it('explains a cancelled or mismatched provider round trip and does nothing', async () => {
    savePendingReauth({ kind: 'remove_member', workspace_id: 'ws-1', member_id: 'm-2', label: 'Bob' });
    members({ has_password: false, providers: ['google'] }, 'mismatch');
    expect(
      await screen.findByText('That was a different account. Use the one connected to your Sineva account.'),
    ).toBeTruthy();
    expect(api).not.toHaveBeenCalled();
    expect(takePendingReauth()).toBeNull();
  });
});

describe('members list', () => {
  it('gives every icon button a name and a tooltip label', () => {
    members({ has_password: true, providers: [] });
    expect(screen.getByRole('button', { name: 'Edit access for Bob Member' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove Bob Member' })).toBeTruthy();
  });

  it('never shows seat-limit copy while entitlements are open', () => {
    const view = members({ has_password: true, providers: [] });
    expect(view.container.textContent).not.toMatch(/seat|plan limit|upgrade/i);
  });
});

describe('ownership acceptance needs a fresh session', () => {
  const preview = {
    state: 'pending' as const,
    workspace_name: 'Acme',
    from_first_name: 'Sam',
    expires_at: '2026-10-29T10:00:00Z',
    is_target: true,
  };

  it('asks to confirm, then lets the person press accept again', async () => {
    api
      .mockRejectedValueOnce(FRESH_REQUIRED)
      .mockResolvedValueOnce({ fresh_until: 'x' });
    shell(
      <LinkAcceptance
        kind="ownership"
        token="abcdefghijklmnop"
        preview={preview}
        reauthMethods={{ has_password: true, providers: [] }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Accept ownership' }));
    const dialog = await screen.findByRole('dialog', { name: "Confirm it's you" });
    fireEvent.change(within(dialog).getByLabelText(/Password/), { target: { value: 'Password123!' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('Confirmed. Press the button below to finish.')).toBeTruthy();
    // Taking over a workspace is never done silently: nothing was accepted yet.
    expect(api).toHaveBeenCalledTimes(2);
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe('invitation link states', () => {
  const base = {
    workspace_name: 'Acme',
    inviter_first_name: 'Sam',
    role: 'member' as const,
    expires_at: '2026-10-29T10:00:00Z',
    email_matches_session: true,
  };

  it.each([
    ['expired', 'This invitation has expired. Ask the owner to send a new one.'],
    ['used', 'This invitation was already used.'],
    ['revoked', 'This invitation was cancelled. Ask the owner to send a new one.'],
  ] as const)('says why a %s link no longer works', (state, text) => {
    shell(<LinkAcceptance kind="invite" token="abcdefghijklmnop" preview={{ ...base, state }} />);
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Join workspace' })).toBeNull();
  });

  it('offers Switch account when the signed-in account is not the invited one', () => {
    shell(
      <LinkAcceptance
        kind="invite"
        token="abcdefghijklmnop"
        preview={{ ...base, state: 'pending', email_matches_session: false }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Switch account' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Join workspace' })).toBeNull();
  });
});

describe('SignInMethods', () => {
  const googleOnly: SignInMethodsView = {
    email: 'oauth@example.com',
    accounts: [{ provider: 'google', provider_email: 'oauth@example.com', provider_username: null }],
    configured: ['google', 'github'],
    fresh: true,
  };
  const both: SignInMethodsView = {
    ...googleOnly,
    accounts: [
      ...googleOnly.accounts,
      { provider: 'credential', provider_email: null, provider_username: null },
    ],
  };

  function methods(view: SignInMethodsView, initialNotice?: string) {
    return shell(<SignInMethods view={view} workspaceSlug="acme" initialNotice={initialNotice} />);
  }

  it('links straight to the provider in link mode and returns to the sign-in tab', () => {
    methods(googleOnly);
    const link = screen.getByRole('link', { name: 'Connect GitHub' });
    const url = new URL(link.getAttribute('href') ?? '', 'http://x');
    expect(url.pathname).toBe('/api/v1/auth/oauth/github');
    expect(url.searchParams.get('intent')).toBe('link');
    expect(url.searchParams.get('return_to')).toBe('/w/acme/settings/profile?tab=sign_in');
  });

  it('disables Connect with a reason when the provider is not set up', () => {
    methods({ ...googleOnly, configured: ['google'] });
    const button = screen.getByRole('button', { name: 'Connect GitHub' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('link', { name: 'Connect GitHub' })).toBeNull();
  });

  it('blocks Disconnect on the only sign-in method', () => {
    methods(googleOnly);
    const button = screen.getByRole('button', { name: 'Disconnect' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('offers Set a password to an account that has none', async () => {
    api.mockResolvedValue(null);
    methods(googleOnly);
    fireEvent.click(screen.getByRole('button', { name: 'Set a password' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/api/v1/auth/request-password-reset', {
        method: 'POST',
        body: { email: 'oauth@example.com' },
      }),
    );
    expect(toast.success).toHaveBeenCalledWith(
      'We sent a link to oauth@example.com. Open it to choose a password.',
    );
  });

  it('hides Set a password once there is one', () => {
    methods(both);
    expect(screen.queryByRole('button', { name: 'Set a password' })).toBeNull();
  });

  it('disconnects after a confirmation and says so', async () => {
    api.mockResolvedValue({ success: true });
    methods(both);
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    const dialog = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));
    expect(within(dialog).getByText('Disconnect Google?')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disconnect' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/api/v1/me/accounts/google', { method: 'DELETE' }),
    );
    expect(toast.success).toHaveBeenCalledWith('Google was disconnected.');
  });

  it('re-confirms with the password when the session is stale, then disconnects', async () => {
    api
      .mockRejectedValueOnce(FRESH_REQUIRED)
      .mockResolvedValueOnce({ fresh_until: 'x' })
      .mockResolvedValueOnce({ success: true });
    methods(both);
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    const confirm = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));
    fireEvent.click(within(confirm).getByRole('button', { name: 'Disconnect' }));
    const dialog = await screen.findByRole('dialog', { name: "Confirm it's you" });
    fireEvent.change(within(dialog).getByLabelText(/Password/), { target: { value: 'Password123!' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(3));
    expect(api.mock.calls[2]).toEqual(['/api/v1/me/accounts/google', { method: 'DELETE' }]);
  });

  it('asks to confirm before leaving for a provider when the session is already stale', async () => {
    methods({ ...googleOnly, fresh: false });
    fireEvent.click(screen.getByRole('link', { name: 'Connect GitHub' }));
    // No navigation: the dialog comes first, and Google can confirm this person.
    expect(await screen.findByRole('dialog', { name: "Confirm it's you" })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Continue with Google' })).toBeTruthy();
  });

  it.each([
    ['account_in_use', 'That account is already connected to another Sineva user.'],
    ['provider_already_linked', 'A different account of that provider is already connected. Disconnect it first.'],
    ['cancelled', 'You cancelled, so nothing was changed.'],
    ['not_configured', 'That sign-in option is not available yet.'],
  ])('explains the %s outcome of a link attempt', async (code, text) => {
    methods(googleOnly, code);
    expect(await screen.findByText(text)).toBeTruthy();
  });

  it('confirms a successful link with a toast', async () => {
    methods(googleOnly, 'linked');
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Connected. You can use it to sign in from now on.'),
    );
  });

  it('speaks Indonesian', () => {
    shell(<SignInMethods view={googleOnly} workspaceSlug="acme" />, 'id');
    expect(screen.getByRole('link', { name: 'Hubungkan GitHub' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Atur kata sandi' })).toBeTruthy();
  });
});

describe('ReauthDialog', () => {
  it('tells a person with no usable method what to do instead of showing an empty dialog', () => {
    shell(
      <ReauthDialog
        open
        onOpenChange={() => undefined}
        methods={{ has_password: false, providers: [] }}
        onPassword={async () => undefined}
        onOAuthStart={() => undefined}
      />,
    );
    expect(screen.getByText(/Sign out, sign in again, then try once more/)).toBeTruthy();
  });
});
