// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InboxDetail } from '@/client/components/inbox/inbox_detail';
import { InboxScreen } from '@/client/components/inbox/inbox_screen';
import type { InboxItemView, InboxListView, InboxCountsView } from '@/shared/inbox_view';
import type { ShellSpecialistView } from '@/shared/shell_view';
import { I18nProvider } from '@/i18n/provider';
import { CATALOGS } from '@/i18n/catalogs';

const api = vi.hoisted(() => vi.fn());
const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock('@/client/lib/api', async (original) => ({
  ...(await original<typeof import('@/client/lib/api')>()),
  apiRequest: api,
}));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const item: InboxItemView = {
  id: 'item-1',
  kind: 'approval',
  tab: 'needs_review',
  state: 'open',
  agent_slug: 'sinosocial',
  title: 'Friday post',
  summary: { key: 'inbox.sentence.draft_review', params: {} },
  source: { type: 'chat', id: null },
  unread: false,
  expires_at: null,
  resolved_at: null,
  created_at: '2026-10-22T00:00:00Z',
  approval: {
    id: 'approval-1',
    status: 'pending',
    action_type: 'draft.review',
    revision: 1,
    version: 7,
    awaiting_revision: false,
    risk_level: 'low',
    requirement: 'guardrail',
    guardrail_reason: null,
    expires_at: '2026-10-29T00:00:00Z',
    decided_by: null,
    decided_by_name: null,
    decided_at: null,
  },
  input_request: null,
  payload: { draft_kind: 'post', title: 'Friday', body: '<script>hostile()</script>' },
  editable_fields: ['title', 'body'],
};
function setup(readOnly = false, data = item) {
  render(
    <I18nProvider locale="en" messages={CATALOGS.en}>
      <InboxDetail item={data} workspaceId="ws-1" workspaceSlug="acme" readOnly={readOnly} />
    </I18nProvider>,
  );
}
it('renders draft text escaped and sends the version actually reviewed', async () => {
  api.mockResolvedValue({});
  setup();
  expect(screen.getByText('<script>hostile()</script>')).toBeTruthy();
  expect(document.querySelector('script')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Approve draft' }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith('/api/v1/workspaces/ws-1/approvals/approval-1/decision', {
      method: 'POST',
      body: { version: 7, decision: 'approve' },
    }),
  );
});
it('never renders decisions for a viewer or an approval awaiting revision', () => {
  setup(true);
  expect(screen.queryByRole('button', { name: 'Approve draft' })).toBeNull();
  cleanup();
  setup(false, { ...item, approval: { ...item.approval!, awaiting_revision: true } });
  expect(screen.queryByRole('button', { name: 'Approve draft' })).toBeNull();
});
it('keeps failed decisions visible and retryable', async () => {
  api.mockRejectedValue(new Error('private upstream details'));
  setup();
  fireEvent.click(screen.getByRole('button', { name: 'Approve draft' }));
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  expect(screen.getByRole('button', { name: 'Approve draft' }).hasAttribute('disabled')).toBe(
    false,
  );
  expect(screen.queryByText('private upstream details')).toBeNull();
});

it('shows edited-draft diff when draft text is changed', async () => {
  setup();
  fireEvent.click(screen.getByRole('button', { name: 'Edit draft' }));
  const textarea = screen.getByLabelText('Draft text');
  fireEvent.change(textarea, { target: { value: 'Edited draft content' } });
  expect(screen.getByText('Original draft')).toBeTruthy();
  expect(screen.getByText('Edited draft')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Hide changes' }));
  expect(screen.queryByText('Original draft')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Show changes' }));
  expect(screen.getByText('Original draft')).toBeTruthy();
});

it('renders expired state with Draft again button for expired items', () => {
  const expiredItem: InboxItemView = {
    ...item,
    state: 'expired',
    source: { type: 'chat', id: 'conv-123' },
    approval: {
      ...item.approval!,
      status: 'expired',
    },
  };
  setup(false, expiredItem);
  expect(screen.getByText('This item has expired.')).toBeTruthy();
  const draftAgain = screen.getByRole('link', { name: 'Draft again' });
  expect(draftAgain.getAttribute('href')).toBe('/w/acme/chat/conv-123');
});

describe('InboxScreen', () => {
  const sampleSpecialists: ShellSpecialistView[] = [
    {
      agent_slug: 'sinosocial',
      display_name: 'SinoSocial',
      role_title: 'Social companion',
      short_description: 'Social companion',
      accent_key: 'social',
      room_theme_id: 'social',
      starter_prompts: ['Prompt 1', 'Prompt 2', 'Prompt 3'],
    },
  ];

  const sampleItems: InboxItemView[] = [
    {
      id: 'item-1',
      kind: 'approval',
      tab: 'needs_review',
      state: 'open',
      agent_slug: 'sinosocial',
      title: 'First draft',
      summary: {
        key: 'inbox.sentence.draft_review',
        params: { name: 'SinoSocial', kind: 'post' },
      },
      source: { type: 'chat', id: 'chat-1' },
      unread: true,
      expires_at: null,
      resolved_at: null,
      created_at: '2026-10-22T00:00:00Z',
      approval: item.approval,
      input_request: null,
    },
    {
      id: 'item-2',
      kind: 'approval',
      tab: 'needs_review',
      state: 'open',
      agent_slug: 'sinosocial',
      title: 'Second draft',
      summary: {
        key: 'inbox.sentence.draft_review',
        params: { name: 'SinoSocial', kind: 'post' },
      },
      source: { type: 'room', id: 'room-1' },
      unread: false,
      expires_at: null,
      resolved_at: null,
      created_at: '2026-10-22T01:00:00Z',
      approval: item.approval,
      input_request: null,
    },
  ];

  const sampleCounts: InboxCountsView = {
    needs_review: 2,
    needs_input: 0,
    done: 0,
    badge: 2,
    unread_needs_review: 1,
    unread_needs_input: 0,
  };

  function setupScreen({
    list = { items: sampleItems, next_cursor: null } as InboxListView,
    selectedItem = sampleItems[0] as InboxItemView | null,
    counts = sampleCounts,
    tab = 'needs_review' as const,
    cursor = undefined as string | undefined,
  } = {}) {
    return render(
      <I18nProvider locale="en" messages={CATALOGS.en}>
        <InboxScreen
          workspaceId="ws-1"
          workspaceSlug="acme"
          tab={tab}
          counts={counts}
          list={list}
          selectedItem={selectedItem}
          cursor={cursor}
          readOnly={false}
          specialists={sampleSpecialists}
        />
      </I18nProvider>,
    );
  }

  it('renders master list rows with full summaries, source, and unread marker', () => {
    setupScreen();
    expect(screen.getAllByText('First draft').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Second draft')).toBeTruthy();
    expect(screen.getByText('From a chat')).toBeTruthy();
    expect(screen.getByText('From a room')).toBeTruthy();
    expect(screen.getByText('Unread')).toBeTruthy();
    expect(screen.getAllByText('Needs review').length).toBeGreaterThanOrEqual(1);
  });

  it('renders empty state when there are no items in needs_review', () => {
    setupScreen({ list: { items: [], next_cursor: null } });
    expect(screen.getByText('You are all caught up.')).toBeTruthy();
  });

  it('navigates through items with j and k keyboard shortcuts', () => {
    setupScreen();
    fireEvent.keyDown(window, { key: 'j' });
    expect(router.push).toHaveBeenCalledWith('/w/acme/inbox?tab=needs_review&item=item-2');
  });

  it('FR-INBOX-30 leaves browser shortcuts and open dialogs alone', () => {
    setupScreen();
    fireEvent.keyDown(window, { key: 'j', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.append(dialog);
    fireEvent.keyDown(dialog, { key: 'j' });
    dialog.remove();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('FR-INBOX-30 retains the current list cursor when selecting the next item', () => {
    setupScreen({ cursor: 'page-two' });
    fireEvent.keyDown(window, { key: 'j' });
    expect(router.push).toHaveBeenCalledWith(
      '/w/acme/inbox?tab=needs_review&cursor=page-two&item=item-2',
    );
  });

  it('renders filter controls for specialist and source', () => {
    setupScreen();
    expect(screen.getByLabelText('Filter by specialist')).toBeTruthy();
    expect(screen.getByLabelText('Filter by source')).toBeTruthy();
  });
});
