import { ApiError } from './api';

/**
 * True when the server refused because the session is older than the fresh
 * window. It is a plain 403 with a detail code, so a role limit ("you cannot
 * do this") never opens the re-confirm dialog by mistake.
 */
export function isFreshSessionRequired(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 403 &&
    error.detailCodes.includes('fresh_session_required')
  );
}

/**
 * The sensitive action to run again once the person has re-confirmed. It
 * survives the round trip to Google or GitHub in sessionStorage (tab-scoped,
 * never sent anywhere) and expires with the fresh window it was waiting for.
 */
export type PendingReauth =
  | { kind: 'remove_member'; workspace_id: string; member_id: string; label: string }
  | { kind: 'transfer_ownership'; workspace_id: string; target_member_id: string; label: string }
  | { kind: 'unlink_provider'; provider: string }
  | { kind: 'link_provider'; provider: string };

const KEY = 'sineva.pending_reauth';
const MAX_AGE_MS = 15 * 60 * 1000;

export function savePendingReauth(action: PendingReauth): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), action }));
  } catch {
    // Storage can be blocked (private mode, policy). The person re-confirms and presses the action again.
  }
}

/** Reads and clears the saved action; null when none, expired or unreadable. */
export function takePendingReauth(): PendingReauth | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { at?: number; action?: PendingReauth };
    if (!saved.action || typeof saved.at !== 'number' || Date.now() - saved.at > MAX_AGE_MS) {
      return null;
    }
    return saved.action;
  } catch {
    return null;
  }
}

/** Drops the one-shot `oauth` notice from the address bar so a refresh does not replay it. */
export function clearOAuthNoticeFromUrl(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('oauth')) return;
    url.searchParams.delete('oauth');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // Cosmetic only.
  }
}
