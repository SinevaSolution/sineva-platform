'use client';

import * as React from 'react';
import { apiRequest } from '@/client/lib/api';
import type { InboxCountsView } from '@/shared/inbox_view';

/**
 * One window event ties the Inbox screen to the sidebar badge. The screen
 * says "the count just changed by this much" (so the badge moves in the same
 * frame as the decision) and "ask the server again" (so the number settles on
 * the truth). A window event, not Redux: the number is server data, and the
 * two sides do not otherwise know each other.
 */
export const INBOX_CHANGED_EVENT = 'sineva:inbox-changed';

export interface InboxChangedDetail {
  /** Added to the badge right away. Negative when something was decided. */
  badge_delta?: number;
  /** Ask the server for the real counts. */
  refetch?: boolean;
}

export function emitInboxChanged(detail: InboxChangedDetail): void {
  window.dispatchEvent(new CustomEvent<InboxChangedDetail>(INBOX_CHANGED_EVENT, { detail }));
}

const POLL_MS = 30_000;

/**
 * The number on the sidebar's Inbox item: what waits for this person. It
 * starts from the server-rendered count, asks again every 30 seconds and when
 * the tab comes back into view, and moves at once when the Inbox screen
 * decides something.
 */
export function useInboxBadge(workspaceId: string, initial: number): number {
  const [badge, setBadge] = React.useState(initial);
  const [seen, setSeen] = React.useState(initial);

  // A new server render (navigation, refresh) is fresher than what we hold.
  // Adjusted while rendering, not in an effect, so there is no frame with the old number.
  if (seen !== initial) {
    setSeen(initial);
    setBadge(initial);
  }

  const refetch = React.useCallback(async () => {
    try {
      const counts = await apiRequest<InboxCountsView>(`/api/v1/workspaces/${workspaceId}/inbox/counts`);
      setBadge(counts.badge);
    } catch {
      // A badge that is a few seconds stale is better than an error in the
      // sidebar; the next poll or focus asks again.
    }
  }, [workspaceId]);

  React.useEffect(() => {
    const poll = window.setInterval(() => void refetch(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refetch();
    };
    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<InboxChangedDetail>).detail;
      if (typeof detail?.badge_delta === 'number') {
        const delta = detail.badge_delta;
        setBadge((current) => Math.max(0, current + delta));
      }
      if (detail?.refetch) void refetch();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener(INBOX_CHANGED_EVENT, onChanged);
    return () => {
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener(INBOX_CHANGED_EVENT, onChanged);
    };
  }, [refetch]);

  return badge;
}
