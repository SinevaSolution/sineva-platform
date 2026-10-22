// Pure model of the Inbox screen: views, URL query, expiry hint, keyboard
// map, word diff and the optimistic shape of a decision. Kept free of React so
// every rule here is unit tested without a DOM.

import type {
  InboxCountsView,
  InboxItemView,
  InboxKindView,
  InboxListTabView,
} from '@/shared/inbox_view';

/** What people see: three views. The wire tab of each has the same name. */
export type InboxView = Extract<InboxListTabView, 'needs_you' | 'updates' | 'done'>;
export const INBOX_VIEWS: readonly InboxView[] = ['needs_you', 'updates', 'done'];

/**
 * A view from the URL. The two tabs of the first Inbox screen are kept as
 * links people may have saved: both are the Needs you view now.
 */
export function viewFromParam(raw: string | undefined | null): InboxView | null {
  if (raw === 'needs_you' || raw === 'updates' || raw === 'done') return raw;
  if (raw === 'needs_review' || raw === 'needs_input') return 'needs_you';
  return null;
}

/**
 * Where the Inbox opens: on what waits for you; on news when nothing waits but
 * some is unread. A viewer cannot decide anything, so they open on news or on
 * what is finished.
 */
export function defaultView(counts: InboxCountsView, viewer: boolean): InboxView {
  if (viewer) return counts.updates > 0 ? 'updates' : 'done';
  if (counts.needs_review + counts.needs_input > 0) return 'needs_you';
  if (counts.unread_updates > 0) return 'updates';
  return 'needs_you';
}

/** The number on a tab: what waits, what is unread news, what is finished. */
export function viewCount(counts: InboxCountsView, view: InboxView): number {
  if (view === 'needs_you') return counts.needs_review + counts.needs_input;
  if (view === 'updates') return counts.unread_updates;
  return counts.done;
}

export interface InboxQuery {
  view: InboxView;
  agent_slug?: string;
  kind?: InboxKindView;
  source_type?: 'chat' | 'room' | 'system';
  q?: string;
  cursor?: string;
  item?: string;
}

/**
 * The query string of the page and of the list call, only what is set and
 * always in the same order, so a filter is a link that can be shared and a
 * test can compare it as text.
 */
export function inboxQueryString(query: InboxQuery): string {
  const params = new URLSearchParams({ tab: query.view });
  if (query.agent_slug) params.set('agent_slug', query.agent_slug);
  if (query.kind) params.set('kind', query.kind);
  if (query.source_type) params.set('source_type', query.source_type);
  const q = query.q?.trim();
  if (q) params.set('q', q);
  if (query.cursor) params.set('cursor', query.cursor);
  if (query.item) params.set('item', query.item);
  return params.toString();
}

export type ExpiryHint = { unit: 'hours' | 'minutes' | 'expired'; count: number };

const HOUR_MS = 3_600_000;

/**
 * "Expires in 2 h": only inside the last day, so a row with a week left stays
 * calm. Hours round up (1 h 59 min reads as 2 h), minutes round up to at
 * least 1.
 */
export function expiryHint(expiresAt: string | null, now: Date): ExpiryHint | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (Number.isNaN(ms)) return null;
  if (ms <= 0) return { unit: 'expired', count: 0 };
  if (ms >= 24 * HOUR_MS) return null;
  if (ms < HOUR_MS) return { unit: 'minutes', count: Math.max(1, Math.ceil(ms / 60_000)) };
  return { unit: 'hours', count: Math.ceil(ms / HOUR_MS) };
}

export type InboxShortcut =
  | 'next'
  | 'previous'
  | 'open'
  | 'approve'
  | 'edit'
  | 'reject'
  | 'changes'
  | 'back'
  | 'search'
  | 'leave_field';

/**
 * Where the key press happened. `field` is text entry, `overlay` is a dialog,
 * menu or list that owns its own keys, `control` is a focused button, link or
 * checkbox (which keep Enter for themselves), `page` is nothing in particular.
 */
export type ShortcutTarget = 'page' | 'control' | 'field' | 'overlay';

export function shortcutTargetOf(target: EventTarget | null): ShortcutTarget {
  if (!(target instanceof HTMLElement)) return 'page';
  if (
    target.closest(
      '[role="dialog"], [role="alertdialog"], [role="combobox"], [role="listbox"], [role="menu"], [role="menuitem"]',
    )
  ) {
    return 'overlay';
  }
  if (target.isContentEditable || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
    return 'field';
  }
  if (target instanceof HTMLInputElement) {
    return ['checkbox', 'radio', 'button', 'submit'].includes(target.type) ? 'control' : 'field';
  }
  if (target.closest('button, a[href], [role="radio"], [role="tab"]')) return 'control';
  return 'page';
}

const KEYS: Record<string, InboxShortcut> = {
  j: 'next',
  k: 'previous',
  Enter: 'open',
  a: 'approve',
  e: 'edit',
  r: 'reject',
  c: 'changes',
  Escape: 'back',
  '/': 'search',
};

/**
 * One key press to one action, or null to leave it alone. Browser shortcuts
 * (Ctrl, Cmd, Alt), capitals, text composition, text fields and overlays are
 * never touched: the only thing a field gives back is Escape.
 */
export function shortcutFor(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'isComposing'>,
  target: ShortcutTarget,
): InboxShortcut | null {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return null;
  if (target === 'overlay') return null;
  if (target === 'field') return event.key === 'Escape' ? 'leave_field' : null;
  const action = KEYS[event.key] ?? null;
  // Enter on a focused button or link presses it; it must not also open the cursor row.
  if (target === 'control' && action === 'open') return null;
  return action;
}

export interface DiffPart {
  type: 'same' | 'add' | 'del';
  text: string;
  /** Words in this part, for the "n words changed" hint. */
  words: number;
}

// The table is O(n * m); 1500 words each is about 2M cells, instant. Longer
// drafts get a whole replacement instead of a frozen tab.
const MAX_DIFF_WORDS = 1500;

/** Words with their leading whitespace, so joining the parts restores the text. */
function tokens(text: string): string[] {
  return text.match(/\s*\S+|\s+/g) ?? [];
}

function push(parts: DiffPart[], type: DiffPart['type'], text: string) {
  const last = parts[parts.length - 1];
  const words = text.trim() ? 1 : 0;
  if (last && last.type === type) {
    last.text += text;
    last.words += words;
  } else {
    parts.push({ type, text, words });
  }
}

/**
 * Word diff of the original against the edited text. Words are compared
 * without their surrounding whitespace; the text of an unchanged run comes
 * from the edited side.
 */
export function diffWords(original: string, edited: string): DiffPart[] {
  if (original === edited) return original ? [{ type: 'same', text: original, words: tokens(original).length }] : [];
  const a = tokens(original);
  const b = tokens(edited);
  if (a.length > MAX_DIFF_WORDS || b.length > MAX_DIFF_WORDS) {
    const parts: DiffPart[] = [];
    if (original) push(parts, 'del', original);
    if (edited) push(parts, 'add', edited);
    return parts;
  }
  const same = (i: number, j: number) => a[i]!.trim() === b[j]!.trim();
  // Longest common subsequence of the suffixes, filled from the end.
  const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i]![j] = same(i, j) ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  const parts: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && same(i, j)) {
      push(parts, 'same', b[j]!);
      i++;
      j++;
    } else if (j >= b.length || (i < a.length && table[i + 1]![j]! >= table[i]![j + 1]!)) {
      push(parts, 'del', a[i]!);
      i++;
    } else {
      push(parts, 'add', b[j]!);
      j++;
    }
  }
  return parts;
}

export function wordsChanged(parts: DiffPart[]): number {
  return parts.reduce((sum, part) => (part.type === 'same' ? sum : sum + part.words), 0);
}

export type InboxDecision = 'approve' | 'reject' | 'changes' | 'answer' | 'skip';

/**
 * The item as the screen shows it the instant a decision is sent, before the
 * server answers. The server's answer replaces it, and a failure puts the old
 * item back, so this only has to look right, not be authoritative.
 */
export function applyDecision(
  item: InboxItemView,
  decision: InboxDecision,
  nowIso: string,
  userId: string | null = null,
): InboxItemView {
  if ((decision === 'answer' || decision === 'skip') && item.input_request) {
    const answered = decision === 'answer';
    return {
      ...item,
      state: answered ? 'resolved' : 'dismissed',
      tab: 'done',
      unread: false,
      resolved_at: nowIso,
      input_request: {
        ...item.input_request,
        status: answered ? 'answered' : 'dismissed',
        answered_by: userId,
        answered_at: nowIso,
        version: item.input_request.version + 1,
      },
    };
  }
  if (!item.approval) return item;
  if (decision === 'changes') {
    return {
      ...item,
      unread: false,
      approval: {
        ...item.approval,
        awaiting_revision: true,
        version: item.approval.version + 1,
      },
    };
  }
  return {
    ...item,
    state: 'resolved',
    tab: 'done',
    unread: false,
    resolved_at: nowIso,
    approval: {
      ...item.approval,
      status: decision === 'approve' ? 'approved' : 'rejected',
      decided_by: userId,
      decided_by_name: null,
      decided_at: nowIso,
      version: item.approval.version + 1,
    },
  };
}

/** The unread numbers after an item is opened (-1) or its dot comes back (+1). */
export function countsAfterRead(counts: InboxCountsView, item: InboxItemView, delta: 1 | -1): InboxCountsView {
  const apply = (n: number) => Math.max(0, n + delta);
  if (item.kind === 'result') return { ...counts, unread_updates: apply(counts.unread_updates) };
  // Only items still waiting are counted as unread in the first two tabs.
  if (item.state !== 'open') return counts;
  return item.kind === 'approval'
    ? { ...counts, unread_needs_review: apply(counts.unread_needs_review) }
    : { ...counts, unread_needs_input: apply(counts.unread_needs_input) };
}

/** The counts after the decision, so tabs and the sidebar badge move at once. */
export function countsAfterDecision(
  counts: InboxCountsView,
  item: InboxItemView,
  decision: InboxDecision,
): InboxCountsView {
  if (decision === 'changes') return counts;
  const wasReview = item.kind === 'approval';
  const needs_review = wasReview ? Math.max(0, counts.needs_review - 1) : counts.needs_review;
  const needs_input = wasReview ? counts.needs_input : Math.max(0, counts.needs_input - 1);
  const unreadReview = item.unread && wasReview ? Math.max(0, counts.unread_needs_review - 1) : counts.unread_needs_review;
  const unreadInput = item.unread && !wasReview ? Math.max(0, counts.unread_needs_input - 1) : counts.unread_needs_input;
  return {
    ...counts,
    needs_review,
    needs_input,
    badge: needs_review + needs_input,
    done: counts.done + 1,
    unread_needs_review: unreadReview,
    unread_needs_input: unreadInput,
  };
}
