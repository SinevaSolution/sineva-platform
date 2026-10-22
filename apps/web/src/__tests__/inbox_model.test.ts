import { describe, expect, it } from 'vitest';
import {
  applyDecision,
  countsAfterDecision,
  countsAfterRead,
  defaultView,
  diffWords,
  expiryHint,
  inboxQueryString,
  shortcutFor,
  viewCount,
  viewFromParam,
  wordsChanged,
  type ShortcutTarget,
} from '@/client/components/inbox/inbox_model';
import type { InboxCountsView, InboxItemView } from '@/shared/inbox_view';

const counts = (over: Partial<InboxCountsView> = {}): InboxCountsView => ({
  needs_review: 0,
  needs_input: 0,
  updates: 0,
  done: 0,
  badge: 0,
  unread_needs_review: 0,
  unread_needs_input: 0,
  unread_updates: 0,
  ...over,
});

const NOW = new Date('2026-10-22T10:00:00.000Z');
const plain = { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, isComposing: false };
const key = (k: string, over: Partial<typeof plain> = {}, target: ShortcutTarget = 'page') =>
  shortcutFor({ key: k, ...plain, ...over }, target);

describe('views and counts', () => {
  it('accepts the three views and maps the old two tabs to Needs you', () => {
    expect(viewFromParam('updates')).toBe('updates');
    expect(viewFromParam('done')).toBe('done');
    expect(viewFromParam('needs_you')).toBe('needs_you');
    expect(viewFromParam('needs_review')).toBe('needs_you');
    expect(viewFromParam('needs_input')).toBe('needs_you');
    expect(viewFromParam('ideas')).toBeNull();
    expect(viewFromParam(undefined)).toBeNull();
  });

  it('opens on Needs you, or on Updates when nothing waits but news is unread, and a viewer never on Needs you', () => {
    expect(defaultView(counts({ badge: 2 }), false)).toBe('needs_you');
    expect(defaultView(counts({ unread_updates: 1 }), false)).toBe('updates');
    expect(defaultView(counts(), false)).toBe('needs_you');
    expect(defaultView(counts({ updates: 3 }), true)).toBe('updates');
    expect(defaultView(counts(), true)).toBe('done');
  });

  it('shows the number that matters per tab: waiting, unread news, finished', () => {
    const c = counts({ needs_review: 2, needs_input: 1, badge: 3, updates: 9, unread_updates: 4, done: 12 });
    expect(viewCount(c, 'needs_you')).toBe(3);
    expect(viewCount(c, 'updates')).toBe(4);
    expect(viewCount(c, 'done')).toBe(12);
  });
});

describe('the list query', () => {
  it('writes only what is set, in a stable order', () => {
    expect(inboxQueryString({ view: 'needs_you' })).toBe('tab=needs_you');
    expect(
      inboxQueryString({ view: 'done', agent_slug: 'sinosocial', kind: 'approval', source_type: 'room', q: 'promo' }),
    ).toBe('tab=done&agent_slug=sinosocial&kind=approval&source_type=room&q=promo');
    expect(inboxQueryString({ view: 'updates', q: '  ' })).toBe('tab=updates');
    expect(inboxQueryString({ view: 'needs_you', cursor: 'abc', item: 'i-1' })).toBe(
      'tab=needs_you&cursor=abc&item=i-1',
    );
  });
});

describe('expiry hint', () => {
  const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
  it('stays quiet when there is time or no deadline', () => {
    expect(expiryHint(null, NOW)).toBeNull();
    expect(expiryHint(at(25 * 3_600_000), NOW)).toBeNull();
  });
  it('counts hours (rounded up) inside a day and minutes inside an hour', () => {
    expect(expiryHint(at(2 * 3_600_000 - 60_000), NOW)).toEqual({ unit: 'hours', count: 2 });
    expect(expiryHint(at(23 * 3_600_000), NOW)).toEqual({ unit: 'hours', count: 23 });
    expect(expiryHint(at(40 * 60_000), NOW)).toEqual({ unit: 'minutes', count: 40 });
    expect(expiryHint(at(10_000), NOW)).toEqual({ unit: 'minutes', count: 1 });
  });
  it('says expired once the time has passed', () => {
    expect(expiryHint(at(-1000), NOW)).toEqual({ unit: 'expired', count: 0 });
  });
});

describe('keyboard shortcuts', () => {
  it('maps the triage keys on the page', () => {
    expect(key('j')).toBe('next');
    expect(key('k')).toBe('previous');
    expect(key('Enter')).toBe('open');
    expect(key('a')).toBe('approve');
    expect(key('e')).toBe('edit');
    expect(key('r')).toBe('reject');
    expect(key('c')).toBe('changes');
    expect(key('Escape')).toBe('back');
    expect(key('/')).toBe('search');
    expect(key('x')).toBeNull();
  });
  it('leaves browser shortcuts, capitals and composing text alone', () => {
    expect(key('a', { metaKey: true })).toBeNull();
    expect(key('j', { ctrlKey: true })).toBeNull();
    expect(key('r', { altKey: true })).toBeNull();
    expect(key('A', { shiftKey: true })).toBeNull();
    expect(key('a', { isComposing: true })).toBeNull();
  });
  it('does nothing but let Escape leave a field while one has focus', () => {
    expect(key('a', {}, 'field')).toBeNull();
    expect(key('j', {}, 'field')).toBeNull();
    expect(key('Enter', {}, 'field')).toBeNull();
    expect(key('Escape', {}, 'field')).toBe('leave_field');
  });
  it('does nothing inside a dialog, menu or list', () => {
    expect(key('a', {}, 'overlay')).toBeNull();
    expect(key('Escape', {}, 'overlay')).toBeNull();
  });
  it('lets Enter act on the focused control instead of opening the cursor row', () => {
    expect(key('Enter', {}, 'control')).toBeNull();
    expect(key('j', {}, 'control')).toBe('next');
  });
});

describe('word diff', () => {
  it('marks added and removed words and keeps the rest', () => {
    const parts = diffWords('Sale on Friday only', 'Big sale on Friday');
    expect(parts.map((p) => `${p.type}:${p.text}`).join('|')).toBe('del:Sale|add:Big sale|same: on Friday|del: only');
  });
  it('counts changed words and reports zero for an identical text', () => {
    expect(wordsChanged(diffWords('a b c', 'a b c'))).toBe(0);
    expect(wordsChanged(diffWords('a b c', 'a x c'))).toBe(2);
  });
  it('degrades to a whole replacement for very long texts instead of freezing', () => {
    const long = Array.from({ length: 3000 }, (_, i) => `w${i}`).join(' ');
    const parts = diffWords(long, `${long} extra`);
    expect(parts.length).toBeLessThanOrEqual(2);
  });
});

const approval = (over: Partial<NonNullable<InboxItemView['approval']>> = {}): InboxItemView => ({
  id: 'item-1',
  kind: 'approval',
  tab: 'needs_review',
  state: 'open',
  agent_slug: 'sinosocial',
  title: 'Friday post',
  summary: { key: 'inbox.sentence.draft_review', params: {} },
  source: { type: 'chat', id: 'run_1' },
  unread: true,
  expires_at: null,
  resolved_at: null,
  created_at: '2026-10-22T00:00:00Z',
  approval: {
    id: 'a-1',
    status: 'pending',
    action_type: 'draft.review',
    revision: 1,
    version: 3,
    awaiting_revision: false,
    risk_level: 'low',
    requirement: 'guardrail',
    guardrail_reason: null,
    expires_at: '2026-10-29T00:00:00Z',
    decided_by: null,
    decided_by_name: null,
    decided_at: null,
    ...over,
  },
  input_request: null,
  payload: { draft_kind: 'post', title: 'T', body: 'B' },
});

describe('optimistic decisions', () => {
  it('approving resolves the item and stamps when', () => {
    const next = applyDecision(approval(), 'approve', NOW.toISOString());
    expect(next.state).toBe('resolved');
    expect(next.tab).toBe('done');
    expect(next.unread).toBe(false);
    expect(next.resolved_at).toBe(NOW.toISOString());
    expect(next.approval).toMatchObject({ status: 'approved', decided_at: NOW.toISOString(), version: 4 });
  });
  it('rejecting resolves it as rejected', () => {
    expect(applyDecision(approval(), 'reject', NOW.toISOString()).approval?.status).toBe('rejected');
  });
  it('asking for changes keeps it open and waiting for a new draft', () => {
    const next = applyDecision(approval(), 'changes', NOW.toISOString());
    expect(next.state).toBe('open');
    expect(next.approval).toMatchObject({ status: 'pending', awaiting_revision: true });
  });
  it('answering a question resolves it as answered', () => {
    const question: InboxItemView = {
      ...approval(),
      kind: 'input_request',
      tab: 'needs_input',
      approval: null,
      input_request: {
        id: 'q-1',
        status: 'pending',
        question: 'Which month?',
        fields: [],
        version: 1,
        due_at: null,
        answered_by: null,
        answered_at: null,
      },
    };
    const next = applyDecision(question, 'answer', NOW.toISOString());
    expect(next.state).toBe('resolved');
    expect(next.input_request).toMatchObject({ status: 'answered', answered_at: NOW.toISOString() });
  });
  it('opening an item takes one off the right unread number and a failed read puts it back', () => {
    const c = counts({ unread_needs_review: 2, unread_needs_input: 1, unread_updates: 3 });
    expect(countsAfterRead(c, approval(), -1)).toMatchObject({ unread_needs_review: 1, unread_needs_input: 1, unread_updates: 3 });
    expect(countsAfterRead(c, { ...approval(), kind: 'result', state: 'resolved' }, -1).unread_updates).toBe(2);
    expect(countsAfterRead(c, { ...approval(), state: 'resolved' }, -1)).toEqual(c);
    expect(countsAfterRead(countsAfterRead(c, approval(), -1), approval(), 1)).toEqual(c);
    expect(countsAfterRead(counts(), approval(), -1).unread_needs_review).toBe(0);
  });
  it('skipping a question dismisses it', () => {
    const question: InboxItemView = {
      ...approval(),
      kind: 'input_request',
      tab: 'needs_input',
      approval: null,
      input_request: { id: 'q-1', status: 'pending', question: 'Q?', fields: [], version: 1, due_at: null, answered_by: null, answered_at: null },
    };
    const next = applyDecision(question, 'skip', NOW.toISOString(), 'me');
    expect(next.state).toBe('dismissed');
    expect(next.input_request).toMatchObject({ status: 'dismissed', answered_by: 'me' });
    expect(countsAfterDecision(counts({ needs_input: 1, badge: 1 }), question, 'skip')).toMatchObject({ needs_input: 0, badge: 0, done: 1 });
  });
  it('moves the counts with the item and never goes below zero', () => {
    const before = counts({ needs_review: 1, needs_input: 0, badge: 1, done: 4 });
    expect(countsAfterDecision(before, approval(), 'approve')).toMatchObject({ needs_review: 0, badge: 0, done: 5 });
    expect(countsAfterDecision(before, approval(), 'changes')).toEqual(before);
    expect(countsAfterDecision(counts(), approval(), 'reject')).toMatchObject({ needs_review: 0, badge: 0, done: 1 });
  });
});
