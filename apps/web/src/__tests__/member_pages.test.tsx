// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextRequest } from 'next/server';
import { SNTooltipProvider } from '@sineva/ui';
import { proxyPageGuard } from '@/proxy';
import { LinkAcceptance } from '@/client/components/members/link_acceptance';
import { MembersScreen } from '@/client/components/members/members_screen';
import { I18nProvider } from '@/i18n/provider';
import { CATALOGS } from '@/i18n/catalogs';
import type { MemberView, InvitationView, OwnershipTransferView } from '@/shared/members_view';
import type { ShellSpecialistView } from '@/shared/shell_view';

const api = vi.hoisted(() => vi.fn());
const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));

vi.mock('@/client/lib/api', async (original) => ({
  ...(await original<typeof import('@/client/lib/api')>()),
  apiRequest: api,
}));

vi.mock('next/navigation', () => ({ useRouter: () => router }));

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

describe('MembersScreen', () => {
  const sampleMembers: MemberView[] = [
    {
      id: 'usr-1',
      display_name: 'Alice Owner',
      avatar_url: null,
      role: 'owner',
      job_title: 'Founder',
      department: 'Leadership',
      status: 'active',
      is_you: true,
      joined_at: '2026-01-01T00:00:00Z',
      email: 'alice@example.com',
    },
    {
      id: 'usr-2',
      display_name: 'Bob Member',
      avatar_url: null,
      role: 'member',
      job_title: 'Engineer',
      department: 'Tech',
      status: 'active',
      is_you: false,
      joined_at: '2026-02-01T00:00:00Z',
      email: 'bob@example.com',
      specialist_scope: 'all',
      specialist_slugs: [],
    },
  ];

  const sampleSpecialists: ShellSpecialistView[] = [
    {
      agent_slug: 'sinosocial',
      display_name: 'SinoSocial',
      role_title: 'Social companion',
      short_description: 'Social companion',
      accent_key: 'social',
      room_theme_id: 'social',
      starter_prompts: ['P1', 'P2', 'P3'],
    },
  ];

  function setupMembers({
    role = 'owner' as const,
    members = sampleMembers,
    invitations = [] as InvitationView[],
    transfer = null as OwnershipTransferView | null,
  } = {}) {
    return render(
      <SNTooltipProvider>
        <I18nProvider locale="en" messages={CATALOGS.en}>
          <MembersScreen
            workspaceId="ws-123"
            role={role}
            members={members}
            invitations={invitations}
            transfer={transfer}
            specialists={sampleSpecialists}
          />
        </I18nProvider>
      </SNTooltipProvider>,
    );
  }

  it('renders members list with display names, emails, and roles', () => {
    setupMembers();
    expect(screen.getByText('Alice Owner')).toBeTruthy();
    expect(screen.getByText('Bob Member')).toBeTruthy();
    expect(screen.getByText('alice@example.com')).toBeTruthy();
    expect(screen.getByText('bob@example.com')).toBeTruthy();
  });

  it('opens MemberDetailDrawer when clicking a member row', async () => {
    setupMembers();
    fireEvent.click(screen.getByText('Bob Member'));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
  });

  it('saves role change in MemberDetailDrawer', async () => {
    api.mockResolvedValue({});
    setupMembers();
    fireEvent.click(screen.getByText('Bob Member'));
    await screen.findByRole('dialog');

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        '/api/v1/workspaces/ws-123/members/usr-2',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
  });

  it('opens InviteDialog and submits an invitation', async () => {
    api.mockResolvedValue({
      invitation: { id: 'inv-1', email: 'charlie@example.com', role: 'member' },
      invite_url: 'http://localhost:3001/invite/abc',
      replaced: false,
      email_sent: true,
    });
    setupMembers();
    fireEvent.click(screen.getByRole('button', { name: 'Invite member' }));
    const emailInput = screen.getByLabelText('Email address');
    fireEvent.change(emailInput, { target: { value: 'charlie@example.com' } });

    // Click submit in the dialog
    const inviteButtons = screen.getAllByRole('button', { name: 'Invite member' });
    fireEvent.click(inviteButtons[inviteButtons.length - 1]);

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        '/api/v1/workspaces/ws-123/invitations',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({ email: 'charlie@example.com' }),
        }),
      ),
    );
  });
});
