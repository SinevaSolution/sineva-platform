// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SNTooltipProvider, snToast } from '@sineva/ui';
import { InboxScreen } from '@/client/components/inbox/inbox_screen';
import { ApiError } from '@/client/lib/api';
import type { InboxCountsView, InboxItemView, InboxListView } from '@/shared/inbox_view';
import type { ShellSpecialistView } from '@/shared/shell_view';
import { I18nProvider } from '@/i18n/provider';
import { CATALOGS } from '@/i18n/catalogs';

const api = vi.hoisted(() => vi.fn());
const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock('@/client/lib/api', async (original) => ({
  ...(await original<typeof import('@/client/lib/api')>()),
  apiRequest: api,
}));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const NOW = '2026-10-22T10:00:00.000Z';
const BASE = '/api/v1/workspaces/ws-1';

function matchDesktop(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
    onchange: null,
  })) as typeof window.matchMedia;
}

beforeEach(() => {
  // jsdom lacks what Radix calls while a select opens.
  const g = globalThis as unknown as Record<string, unknown>;
  g.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
  matchDesktop(true);
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.spyOn(window.history, 'replaceState');
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const approvalOf = (over: Partial<NonNullable<InboxItemView['approval']>> = {}) => ({
  id: 'approval-1',
  status: 'pending' as const,
  action_type: 'draft.review',
  revision: 1,
  version: 7,
  awaiting_revision: false,
  risk_level: 'low' as const,
  requirement: 'guardrail' as const,
  guardrail_reason: null,
  expires_at: '2026-10-29T10:00:00.000Z',
  decided_by: null,
  decided_by_name: null,
  decided_at: null,
  ...over,
});

const draft: InboxItemView = {
  id: 'item-1',
  kind: 'approval',
  tab: 'needs_review',
  state: 'open',
  agent_slug: 'sinosocial',
  title: 'Friday post',
  summary: { key: 'inbox.sentence.draft_review', params: { specialist_slug: 'sinosocial', draft_kind: 'post' } },
  source: { type: 'chat', id: 'run_1', conversation_id: 'conv-9' },
  unread: true,
  expires_at: '2026-10-22T12:00:00.000Z',
  resolved_at: null,
  created_at: '2026-10-22T09:00:00.000Z',
  approval: approvalOf(),
  input_request: null,
  payload: { draft_kind: 'post', title: 'Friday', body: 'Sale on Friday <script>hostile()</script>' },
  editable_fields: ['title', 'body'],
};

const second: InboxItemView = {
  ...draft,
  id: 'item-2',
  title: 'Second draft',
  unread: false,
  expires_at: null,
  agent_slug: 'sinofinance',
  created_at: '2026-10-22T08:00:00.000Z',
  approval: approvalOf({ id: 'approval-2', version: 2 }),
  payload: { draft_kind: 'reply', title: 'Re: invoice', body: 'Paid.' },
};

const question: InboxItemView = {
  ...draft,
  id: 'item-q',
  kind: 'input_request',
  tab: 'needs_input',
  agent_slug: 'sinofinance',
  title: 'Which month?',
  summary: { key: 'inbox.sentence.input_request', params: { specialist_slug: 'sinofinance' } },
  expires_at: null,
  approval: null,
  payload: undefined,
  editable_fields: undefined,
  input_request: {
    id: 'input-1',
    status: 'pending',
    question: 'Which month should I reconcile?',
    version: 3,
    due_at: null,
    answered_by: null,
    answered_at: null,
    fields: [
      { key: 'period', type: 'text', label: 'Period', required: true },
      { key: 'currency', type: 'choice', label: 'Currency', required: true, choices: ['IDR', 'USD', 'EUR', 'SGD'] },
      { key: 'urgent', type: 'boolean', label: 'Urgent', required: true },
      { key: 'notify', type: 'boolean', label: 'Tell me when done', required: false },
      { key: 'rows', type: 'number', label: 'Rows', required: false },
    ],
  },
};

const update: InboxItemView = {
  ...draft,
  id: 'item-u',
  kind: 'result',
  tab: 'updates',
  state: 'resolved',
  agent_slug: 'sinoinsights',
  title: 'Weekly report ready',
  summary: { key: 'inbox.sentence.result', params: { specialist_slug: 'sinoinsights' } },
  expires_at: null,
  approval: null,
};

/** The server's record of the draft once someone decided it. */
const decidedRecord = (status: 'approved' | 'rejected', by = 'me', name: string | null = 'Rina'): InboxItemView => ({
  ...draft,
  state: 'resolved',
  tab: 'done',
  approval: approvalOf({ status, decided_by: by, decided_by_name: name, decided_at: NOW }),
});

const answeredRecord = (status: 'answered' | 'dismissed'): InboxItemView => ({
  ...question,
  state: status === 'answered' ? 'resolved' : 'dismissed',
  tab: 'done',
  input_request: { ...question.input_request!, status, answered_by: 'me', answered_at: NOW },
});

const specialists: ShellSpecialistView[] = [
  {
    agent_slug: 'sinosocial',
    display_name: 'SinoSocial',
    role_title: 'Social Specialist',
    short_description: 'Social',
    accent_key: 'social',
    room_theme_id: 'social',
    starter_prompts: ['a', 'b', 'c'],
  },
  {
    agent_slug: 'sinofinance',
    display_name: 'SinoFinance',
    role_title: 'Finance Specialist',
    short_description: 'Finance',
    accent_key: 'finance',
    room_theme_id: 'finance',
    starter_prompts: ['a', 'b', 'c'],
  },
];

const counts = (over: Partial<InboxCountsView> = {}): InboxCountsView => ({
  needs_review: 2,
  needs_input: 1,
  updates: 3,
  done: 5,
  badge: 3,
  unread_needs_review: 1,
  unread_needs_input: 1,
  unread_updates: 2,
  ...over,
});

type ScreenProps = Partial<React.ComponentProps<typeof InboxScreen>>;

function setup(over: ScreenProps = {}) {
  const props: React.ComponentProps<typeof InboxScreen> = {
    workspaceId: 'ws-1',
    workspaceSlug: 'acme',
    currentUserId: 'me',
    view: 'needs_you',
    counts: counts(),
    list: { items: [draft, second, question], next_cursor: null } as InboxListView,
    selectedItem: null,
    readOnly: false,
    specialists,
    filters: {},
    serverNow: NOW,
    ...over,
  };
  return render(
    <I18nProvider locale="en" messages={CATALOGS.en}>
      <SNTooltipProvider>
        <InboxScreen {...props} />
      </SNTooltipProvider>
    </I18nProvider>,
  );
}

/** Routes the mocked API by path so a test only names what it cares about. */
function route(handlers: Record<string, (init?: { method?: string; body?: unknown }) => unknown>) {
  api.mockImplementation(async (path: string, init?: { method?: string; body?: unknown }) => {
    const key = Object.keys(handlers).find((k) => path.endsWith(k));
    if (!key) return {};
    const handler = handlers[key]!;
    return handler(init);
  });
}

async function open(title: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(title) }));
  await screen.findByRole('heading', { name: title, level: 2 });
}

describe('the list', () => {
  it('shows three tabs with the numbers that matter and marks the current one', () => {
    setup();
    const nav = screen.getByRole('navigation', { name: 'Inbox views' });
    const needs = within(nav).getByRole('link', { name: /Needs you/ });
    expect(needs.getAttribute('aria-current')).toBe('page');
    expect(needs.textContent).toContain('3');
    expect(within(nav).getByRole('link', { name: /Updates/ }).textContent).toContain('2');
    expect(within(nav).getByRole('link', { name: /Done/ }).textContent).toContain('5');
    expect(within(nav).getByRole('link', { name: /Updates/ }).getAttribute('href')).toBe('/w/acme/inbox?tab=updates');
  });

  it('writes each row as who, what will happen in plain words, when, unread, kind and expiry', () => {
    setup();
    const row = screen.getByRole('button', { name: /Friday post/ });
    expect(within(row).getByText('SinoSocial wrote a post for you to check. Nothing is sent.')).toBeTruthy();
    expect(within(row).getByText('Unread')).toBeTruthy();
    expect(within(row).getByText('Sino needs your OK')).toBeTruthy();
    expect(within(row).getByText('Expires in 2 h')).toBeTruthy();
    expect(within(row).getByText('1 hour ago')).toBeTruthy();
    const q = screen.getByRole('button', { name: /Which month/ });
    expect(within(q).getByText('Sino has a question')).toBeTruthy();
    expect(within(q).getByText('SinoFinance has a question for you.')).toBeTruthy();
    expect(within(screen.getByRole('button', { name: /Second draft/ })).queryByText('Unread')).toBeNull();
  });

  it('never prints the words run, payload or approval id', () => {
    setup({ selectedItem: draft });
    const text = document.body.textContent ?? '';
    for (const word of [/\brun\b/i, /payload/i, /approval_id/i, /input request/i]) {
      expect(text).not.toMatch(word);
    }
  });

  it('filters by specialist and by kind through the address, one click each', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'SinoFinance' }));
    expect(router.push).toHaveBeenLastCalledWith('/w/acme/inbox?tab=needs_you&agent_slug=sinofinance', { scroll: false });
    fireEvent.click(screen.getByRole('button', { name: 'Questions' }));
    expect(router.push).toHaveBeenLastCalledWith('/w/acme/inbox?tab=needs_you&kind=input_request', { scroll: false });
  });

  it('shows the active filter as pressed and clicking it again clears it', () => {
    setup({ filters: { agent_slug: 'sinofinance' } });
    const chip = screen.getByRole('button', { name: 'SinoFinance' });
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(chip);
    expect(router.push).toHaveBeenLastCalledWith('/w/acme/inbox?tab=needs_you', { scroll: false });
  });

  it('searches after a short pause and keeps the text in the address', () => {
    vi.useFakeTimers();
    setup();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search the Inbox' }), { target: { value: 'promo' } });
    expect(router.replace).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(router.replace).toHaveBeenCalledWith('/w/acme/inbox?tab=needs_you&q=promo', { scroll: false });
  });

  it('hides the kind chips on Updates, where everything is a result', () => {
    setup({ view: 'updates', list: { items: [update], next_cursor: null } });
    expect(screen.queryByRole('button', { name: 'Questions' })).toBeNull();
    expect(within(screen.getByRole('button', { name: /Weekly report ready/ })).getByText('Update')).toBeTruthy();
  });

  it('loads the next page into the same list without leaving it', async () => {
    route({ '/inbox?tab=needs_you&cursor=c2': () => ({ items: [{ ...second, id: 'item-3', title: 'Third draft' }], next_cursor: null }) });
    setup({ list: { items: [draft, second], next_cursor: 'c2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    await screen.findByRole('button', { name: /Third draft/ });
    expect(api).toHaveBeenCalledWith(`${BASE}/inbox?tab=needs_you&cursor=c2`);
    expect(screen.getByRole('button', { name: /Friday post/ })).toBeTruthy();
  });
});

describe('empty states', () => {
  it('says all caught up on Needs you, with a thumbs up', () => {
    setup({ counts: counts({ needs_review: 0, needs_input: 0, badge: 0 }), list: { items: [], next_cursor: null } });
    expect(screen.getByRole('heading', { name: 'All caught up' })).toBeTruthy();
    expect(document.querySelector('img[src*="sino-thumbs-up"]')).toBeTruthy();
  });

  it('has its own empty state for Updates and Done', () => {
    setup({ view: 'updates', list: { items: [], next_cursor: null } });
    expect(screen.getByRole('heading', { name: 'No updates yet' })).toBeTruthy();
    cleanup();
    setup({ view: 'done', list: { items: [], next_cursor: null } });
    expect(screen.getByRole('heading', { name: 'Nothing done yet' })).toBeTruthy();
  });

  it('tells a filtered or searched list apart and offers to clear it', () => {
    setup({ filters: { agent_slug: 'sinofinance' }, list: { items: [], next_cursor: null } });
    expect(screen.getByRole('heading', { name: 'Nothing matches' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(router.push).toHaveBeenLastCalledWith('/w/acme/inbox?tab=needs_you', { scroll: false });
    cleanup();
    setup({ filters: { q: 'zzz' }, list: { items: [], next_cursor: null } });
    expect(screen.getByRole('heading', { name: 'Nothing found for zzz' })).toBeTruthy();
  });

  it('explains what will land here on a first visit', () => {
    setup({
      counts: counts({ needs_review: 0, needs_input: 0, badge: 0, updates: 0, done: 0, unread_updates: 0 }),
      list: { items: [], next_cursor: null },
    });
    expect(screen.getByRole('heading', { name: 'Your Inbox is ready' })).toBeTruthy();
    expect(screen.getByText('Drafts to approve')).toBeTruthy();
    expect(screen.getByText('Questions from Sino')).toBeTruthy();
    expect(screen.getByText('Finished work')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Start a chat' }).getAttribute('href')).toBe('/w/acme/new');
  });

  it('shows an error with a retry when the list could not be loaded', () => {
    setup({ list: null, listError: true });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalled();
  });
});

describe('opening an item', () => {
  it('shows the detail beside the list, marks it read and writes the address', async () => {
    route({ '/inbox/item-1': () => draft });
    setup();
    await open('Friday post');
    expect(window.history.replaceState).toHaveBeenCalledWith(null, '', '/w/acme/inbox?tab=needs_you&item=item-1');
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(`${BASE}/inbox/item-1/read`, { method: 'POST' }),
    );
    expect(within(screen.getByRole('button', { name: /Friday post/ })).queryByText('Unread')).toBeNull();
  });

  it('puts the unread dot back when marking read fails', async () => {
    api.mockImplementation(async (path: string) => {
      if (path.endsWith('/read')) throw new ApiError('x', 500);
      return draft;
    });
    setup();
    await open('Friday post');
    await waitFor(() => expect(within(screen.getByRole('button', { name: /Friday post/ })).getByText('Unread')).toBeTruthy());
  });

  it('renders who, what, when and a link back to the chat, with the draft escaped', async () => {
    setup({ selectedItem: draft });
    const detail = screen.getByRole('region', { name: 'Friday post' });
    expect(within(detail).getByText('SinoSocial')).toBeTruthy();
    expect(within(detail).getByRole('link', { name: 'Open the chat' }).getAttribute('href')).toBe('/w/acme/chat/conv-9');
    expect(within(detail).getByText('Sale on Friday <script>hostile()</script>')).toBeTruthy();
    expect(document.querySelector('script')).toBeNull();
    expect(within(detail).getByText('Sino will not do anything until you approve.')).toBeTruthy();
  });

  it('asks for the detail when the list was opened without one, and retries on failure', async () => {
    let failing = true;
    api.mockImplementation(async (path: string) => {
      if (path.endsWith('/read')) return {};
      if (failing) {
        failing = false;
        throw new ApiError('x', 503);
      }
      return draft;
    });
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Friday post/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await screen.findByRole('heading', { name: 'Friday post', level: 2 });
  });
});

describe('keyboard', () => {
  it('j and k move through the list and open each item on a wide screen', async () => {
    route({ '/inbox/item-1': () => draft, '/inbox/item-2': () => second });
    setup({ selectedItem: draft });
    fireEvent.keyDown(document.body, { key: 'j' });
    await screen.findByRole('heading', { name: 'Second draft', level: 2 });
    fireEvent.keyDown(document.body, { key: 'k' });
    await screen.findByRole('heading', { name: 'Friday post', level: 2 });
  });

  it('on a phone j only moves and Enter opens', async () => {
    matchDesktop(false);
    route({ '/inbox/item-2': () => second });
    setup();
    fireEvent.keyDown(document.body, { key: 'j' });
    fireEvent.keyDown(document.body, { key: 'j' });
    expect(screen.queryByRole('heading', { name: 'Second draft', level: 2 })).toBeNull();
    fireEvent.keyDown(document.body, { key: 'Enter' });
    await screen.findByRole('heading', { name: 'Second draft', level: 2 });
  });

  it('r, c and e only move focus or open editors; r never rejects by itself', () => {
    setup({ selectedItem: draft });
    api.mockClear();
    fireEvent.keyDown(document.body, { key: 'r' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reject' }));
    expect(screen.queryByLabelText('Note (optional)')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(screen.getByLabelText('Note (optional)')).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    fireEvent.keyDown(document.body, { key: 'c' });
    expect(screen.getByLabelText('What should change?')).toBeTruthy();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    fireEvent.keyDown(document.body, { key: 'e' });
    expect(screen.getByRole('textbox', { name: 'Text' })).toBeTruthy();
    expect(api.mock.calls.filter(([path]) => String(path).includes('/decision'))).toHaveLength(0);
  });

  it('FR-INBOX-30: a alone never approves, it focuses Approve and says to press Enter', async () => {
    route({ '/decision': () => ({}), '/inbox/item-1': () => decidedRecord('approved') });
    setup({ selectedItem: { ...draft, unread: false }, list: { items: [{ ...draft, unread: false }, second], next_cursor: null } });
    fireEvent.keyDown(document.body, { key: 'a' });
    const approve = screen.getByRole('button', { name: 'Approve' });
    expect(document.activeElement).toBe(approve);
    expect(screen.getByText('Press Enter to approve')).toBeTruthy();
    expect(api).not.toHaveBeenCalled();
    expect(screen.queryByText('You approved this draft')).toBeNull();
    // Enter on a focused button is a click.
    fireEvent.click(approve);
    await screen.findByText('You approved this draft');
    expect(api).toHaveBeenCalledWith(`${BASE}/approvals/approval-1/decision`, {
      method: 'POST',
      body: { version: 7, decision: 'approve' },
    });
  });

  it('does nothing while a field has focus, and Escape leaves the field', () => {
    setup({ selectedItem: { ...draft, unread: false }, list: { items: [{ ...draft, unread: false }, second, question], next_cursor: null } });
    const search = screen.getByRole('searchbox', { name: 'Search the Inbox' });
    search.focus();
    fireEvent.keyDown(search, { key: 'a' });
    fireEvent.keyDown(search, { key: 'j' });
    expect(api).not.toHaveBeenCalled();
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(document.activeElement).not.toBe(search);
  });

  it('leaves browser shortcuts alone', () => {
    setup({ selectedItem: { ...draft, unread: false }, list: { items: [{ ...draft, unread: false }, second, question], next_cursor: null } });
    fireEvent.keyDown(document.body, { key: 'a', metaKey: true });
    fireEvent.keyDown(document.body, { key: 'a', ctrlKey: true });
    expect(api).not.toHaveBeenCalled();
  });

  it('Escape closes the open item and goes back to the list', () => {
    setup({ selectedItem: draft });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Friday post' })).toBeNull();
    expect(window.history.replaceState).toHaveBeenLastCalledWith(null, '', '/w/acme/inbox?tab=needs_you');
  });

  it('shows the key in the tooltip of each action', async () => {
    setup({ selectedItem: draft });
    const approve = screen.getByRole('button', { name: 'Approve' });
    act(() => approve.focus());
    expect((await screen.findAllByText('a then Enter')).length).toBeGreaterThan(0);
  });
});

describe('deciding a draft', () => {
  it('shows the result at once, then replaces it with the server record', async () => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => (finish = resolve));
    api.mockImplementation(async (path: string) => {
      if (path.endsWith('/decision')) {
        await gate;
        return {};
      }
      if (path.endsWith('/inbox/counts')) return counts({ needs_review: 1, badge: 2, done: 6 });
      return { ...draft, state: 'resolved', tab: 'done', approval: approvalOf({ status: 'approved', decided_by: 'me', decided_by_name: 'Rina', decided_at: NOW }) };
    });
    setup({ selectedItem: draft });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('You approved this draft')).toBeTruthy();
    expect(api).toHaveBeenCalledWith(`${BASE}/approvals/approval-1/decision`, {
      method: 'POST',
      body: { version: 7, decision: 'approve' },
    });
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Friday post/ })).toBeNull();
    expect(screen.getByRole('link', { name: /Needs you/ }).textContent).toContain('2');
    await act(async () => finish());
    await waitFor(() => expect(screen.getByRole('link', { name: /Needs you/ }).textContent).toContain('2'));
    expect(screen.getByText('You approved this draft')).toBeTruthy();
  });

  it('puts everything back and says why when the decision fails', async () => {
    const toast = vi.spyOn(snToast, 'error').mockReturnValue('t');
    api.mockRejectedValue(new ApiError('x', 503, 'run_resume_unavailable'));
    setup({ selectedItem: draft });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Friday post/ })).toBeTruthy();
    expect(screen.queryByText('You approved this draft')).toBeNull();
    expect(screen.getByRole('link', { name: /Needs you/ }).textContent).toContain('3');
    expect(toast.mock.calls[0]?.[0]).not.toContain('run_resume_unavailable');
  });

  it('shows who decided first and refetches when someone else got there first', async () => {
    const info = vi.spyOn(snToast, 'info').mockReturnValue('t');
    api.mockImplementation(async (path: string) => {
      if (path.endsWith('/decision')) throw new ApiError('x', 409, 'already_decided', ['already_decided']);
      if (path.endsWith('/inbox/counts')) return counts({ needs_review: 1, badge: 2 });
      return {
        ...draft,
        state: 'resolved',
        tab: 'done',
        approval: approvalOf({ status: 'rejected', decided_by: 'rina', decided_by_name: 'Rina', decided_at: NOW }),
      };
    });
    setup({ selectedItem: draft });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Rina got there first')).toBeTruthy();
    expect(screen.getByText('Rina rejected this draft')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(info).toHaveBeenCalled();
  });

  it('edits the draft in place, hints at what changed and sends only then the edited text', async () => {
    route({ '/decision': () => ({}), '/inbox/item-1': () => decidedRecord('approved') });
    setup({ selectedItem: draft });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.queryByText(/You changed/)).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Friday sale' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Text' }), { target: { value: 'Big sale on Friday' } });
    expect(screen.getByText(/You changed \d+ words?/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show changes' }));
    expect(screen.getByText('Original')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(`${BASE}/approvals/approval-1/decision`, {
        method: 'POST',
        body: {
          version: 7,
          decision: 'approve',
          edited_payload: { draft_kind: 'post', title: 'Friday sale', body: 'Big sale on Friday' },
        },
      }),
    );
  });

  it('sends no edit when the text is back to the original', async () => {
    route({ '/decision': () => ({}), '/inbox/item-1': () => decidedRecord('approved') });
    setup({ selectedItem: draft });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(`${BASE}/approvals/approval-1/decision`, {
        method: 'POST',
        body: { version: 7, decision: 'approve' },
      }),
    );
  });

  it('asks for changes with a short instruction and keeps the draft waiting', async () => {
    route({ '/changes': () => ({}), '/inbox/item-1': () => ({ ...draft, approval: approvalOf({ awaiting_revision: true, version: 8 }) }) });
    setup({ selectedItem: draft });
    fireEvent.click(screen.getByRole('button', { name: 'Ask for changes' }));
    const send = screen.getByRole('button', { name: 'Send request' });
    expect(send.getAttribute('aria-disabled') ?? send.getAttribute('disabled')).not.toBeNull();
    fireEvent.change(screen.getByLabelText('What should change?'), { target: { value: 'Shorter please' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(`${BASE}/approvals/approval-1/changes`, {
        method: 'POST',
        body: { version: 7, instruction: 'Shorter please' },
      }),
    );
    expect(await screen.findByText('Waiting for a new draft from SinoSocial.')).toBeTruthy();
  });

  it('rejects with an optional note', async () => {
    route({ '/decision': () => ({}), '/inbox/item-1': () => decidedRecord('rejected') });
    setup({ selectedItem: draft });
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: 'Wrong tone' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reject draft' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(`${BASE}/approvals/approval-1/decision`, {
        method: 'POST',
        body: { version: 7, decision: 'reject', note: 'Wrong tone' },
      }),
    );
    expect(await screen.findByText('You rejected this draft')).toBeTruthy();
  });

  it('gives a viewer the draft summary and no way to decide', () => {
    setup({ selectedItem: { ...draft, payload: undefined, editable_fields: undefined }, readOnly: true });
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByText('Sino will not do anything until you approve.')).toBeNull();
  });

  it('shows when a draft was approved by someone else and that it was edited first', () => {
    setup({
      selectedItem: {
        ...draft,
        state: 'resolved',
        tab: 'done',
        approval: approvalOf({ status: 'approved', decided_by: 'rina', decided_by_name: 'Rina', decided_at: '2026-10-22T09:30:00.000Z' }),
        revisions: [
          { revision: 1, payload_hash: 'h1', created_by: 'specialist', created_at: NOW, payload: { body: 'Sale on Friday' } },
          { revision: 2, payload_hash: 'h2', created_by: 'user', created_at: NOW, payload: { body: 'Big sale on Friday' } },
        ],
      },
      view: 'done',
    });
    expect(screen.getByText('Rina approved this draft')).toBeTruthy();
    expect(screen.getByText('Edited before it was approved')).toBeTruthy();
  });

  it('says a draft expired, that nothing was sent, and links to draft it again', () => {
    setup({
      selectedItem: { ...draft, state: 'expired', tab: 'done', source: { type: 'chat', id: 'run_1', conversation_id: 'conv-9' }, approval: approvalOf({ status: 'expired' }) },
      view: 'done',
    });
    expect(screen.getByText('This draft expired')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Draft again' }).getAttribute('href')).toBe('/w/acme/chat/conv-9');
  });
});

describe('answering a question', () => {
  it('renders each field with the right control and sends the answers', async () => {
    route({ '/answer': () => ({}), '/inbox/item-q': () => answeredRecord('answered') });
    setup({ selectedItem: question });
    expect(screen.getByText('Which month should I reconcile?')).toBeTruthy();
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send.getAttribute('aria-disabled') ?? send.getAttribute('disabled')).not.toBeNull();

    fireEvent.change(screen.getByLabelText(/Period/), { target: { value: 'September' } });
    const trigger = screen.getByRole('combobox', { name: /Currency/ });
    await act(async () => {
      trigger.focus();
      fireEvent.keyDown(trigger, { key: 'Enter' });
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole('option', { name: 'USD' }));
    });
    const urgent = screen.getByRole('radiogroup', { name: /Urgent/ });
    fireEvent.click(within(urgent).getByRole('radio', { name: 'Yes' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tell me when done' }));
    fireEvent.change(screen.getByLabelText('Rows'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(`${BASE}/inbox/item-q/answer`, {
        method: 'POST',
        body: {
          version: 3,
          answers: { period: 'September', currency: 'USD', urgent: true, notify: true, rows: 12 },
        },
      }),
    );
    expect(await screen.findByText('You answered this question')).toBeTruthy();
  });

  it('lets a short choice be one tap', () => {
    setup({
      selectedItem: {
        ...question,
        input_request: {
          ...question.input_request!,
          fields: [{ key: 'size', type: 'choice', label: 'Size', required: true, choices: ['S', 'M'] }],
        },
      },
    });
    expect(within(screen.getByRole('radiogroup', { name: /Size/ })).getAllByRole('radio')).toHaveLength(2);
  });

  it('can skip a question', async () => {
    route({ '/dismiss': () => ({}), '/inbox/item-q': () => answeredRecord('dismissed') });
    setup({ selectedItem: question });
    fireEvent.click(screen.getByRole('button', { name: 'Skip this question' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(`${BASE}/inbox/item-q/dismiss`, { method: 'POST' }),
    );
  });
});

describe('on a phone', () => {
  it('shows the list first, then the detail full screen with a way back', async () => {
    matchDesktop(false);
    const { container } = setup();
    expect(container.querySelector('[data-pane="list"]')?.getAttribute('data-hidden-mobile')).toBe('false');
    route({ '/inbox/item-1': () => draft });
    await open('Friday post');
    expect(container.querySelector('[data-pane="list"]')?.getAttribute('data-hidden-mobile')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Back to Inbox' }));
    expect(container.querySelector('[data-pane="list"]')?.getAttribute('data-hidden-mobile')).toBe('false');
  });
});
