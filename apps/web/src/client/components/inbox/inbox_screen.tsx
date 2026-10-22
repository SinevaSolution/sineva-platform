'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';
import { SNErrorState, SNSkeleton, snToast } from '@sineva/ui';
import { ApiError, apiRequest } from '@/client/lib/api';
import { useApiErrorText } from '@/client/lib/use_api_error';
import { cn } from '@/client/components/ui/cn';
import { useTranslations } from '@/i18n/provider';
import type { InboxCountsView, InboxItemView, InboxListView } from '@/shared/inbox_view';
import type { ShellSpecialistView } from '@/shared/shell_view';
import { InboxDetail, type DetailAction, type InboxDetailApi } from './inbox_detail';
import { InboxFirstRun, InboxPickOne } from './inbox_empty';
import { emitInboxChanged } from './inbox_events';
import type { InboxFilterValues } from './inbox_filters';
import { InboxList } from './inbox_list';
import {
  applyDecision,
  countsAfterDecision,
  countsAfterRead,
  inboxQueryString,
  shortcutFor,
  shortcutTargetOf,
  type InboxDecision,
  type InboxView,
} from './inbox_model';
import { useInboxText, useNow } from './inbox_text';

export interface InboxScreenProps {
  workspaceId: string;
  workspaceSlug: string;
  /** Who is looking, so "You approved this" can be told from "Rina approved this". */
  currentUserId: string;
  view: InboxView;
  counts: InboxCountsView;
  /** Null when the first page could not be loaded. */
  list: InboxListView | null;
  listError?: boolean;
  selectedItem: InboxItemView | null;
  readOnly: boolean;
  specialists: ShellSpecialistView[];
  filters: InboxFilterValues;
  /** The time the server rendered at, so the first paint matches the server's HTML. */
  serverNow: string;
}

const SEARCH_PAUSE_MS = 300;
const WIDE = '(min-width: 1024px)';

const isWide = () => typeof window.matchMedia === 'function' && window.matchMedia(WIDE).matches;

function isCounts(value: unknown): value is InboxCountsView {
  return typeof value === 'object' && value !== null && typeof (value as InboxCountsView).badge === 'number';
}

function isList(value: unknown): value is InboxListView {
  return typeof value === 'object' && value !== null && Array.isArray((value as InboxListView).items);
}

function isItem(value: unknown, id: string): value is InboxItemView {
  return typeof value === 'object' && value !== null && (value as InboxItemView).id === id;
}

/**
 * The Inbox: a list on the left and the open item on the right on a wide
 * screen, the list and then the item full screen on a phone.
 *
 * What the server rendered is the starting point. From there the screen keeps
 * its own copy so a decision shows at once (and is rolled back if it fails),
 * the next item opens without a page load, and the sidebar badge moves in the
 * same frame. The address always names the view, the filters and the open
 * item, so a reload or a shared link lands in the same place.
 */
export function InboxScreen({
  workspaceId,
  workspaceSlug,
  currentUserId,
  view,
  counts: serverCounts,
  list,
  listError = false,
  selectedItem,
  readOnly,
  specialists,
  filters,
  serverNow,
}: InboxScreenProps) {
  const t = useTranslations('inbox_ui');
  const errorText = useApiErrorText();
  const router = useRouter();
  const now = useNow(serverNow);
  const text = useInboxText(specialists, now);
  const base = `/api/v1/workspaces/${workspaceId}`;
  const [navigating, startNavigation] = React.useTransition();

  const [items, setItems] = React.useState<InboxItemView[]>(list?.items ?? []);
  const [nextCursor, setNextCursor] = React.useState<string | null>(list?.next_cursor ?? null);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [counts, setCounts] = React.useState(serverCounts);
  const [openId, setOpenId] = React.useState<string | null>(selectedItem?.id ?? null);
  const [cursorId, setCursorId] = React.useState<string | null>(selectedItem?.id ?? null);
  const [details, setDetails] = React.useState<Record<string, InboxItemView>>(() =>
    selectedItem ? { [selectedItem.id]: selectedItem } : {},
  );
  const [loadState, setLoadState] = React.useState<Record<string, { message: string } | 'loading'>>({});
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [conflicts, setConflicts] = React.useState<ReadonlySet<string>>(new Set());
  // Where "Next" goes once the open item has left the list because it was decided.
  const [settled, setSettled] = React.useState<{ from: string; next: string | null } | null>(null);
  const [search, setSearch] = React.useState(filters.q ?? '');

  // The latest state for handlers that outlive a render (keys, timers, calls in flight).
  const latest = React.useRef({ items, counts, details, openId, cursorId });
  latest.current = { items, counts, details, openId, cursorId };
  const detailApi = React.useRef<InboxDetailApi | null>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const searchTimer = React.useRef<number | undefined>(undefined);

  // A new server render (a search, a refresh) replaces what was held; a view or
  // filter change remounts the screen from the page. Adjusted while rendering,
  // not in an effect, so no frame shows the old list under the new address.
  const [seenList, setSeenList] = React.useState(list);
  if (seenList !== list) {
    setSeenList(list);
    setItems(list?.items ?? []);
    setNextCursor(list?.next_cursor ?? null);
  }
  const [seenCounts, setSeenCounts] = React.useState(serverCounts);
  if (seenCounts !== serverCounts) {
    setSeenCounts(serverCounts);
    setCounts(serverCounts);
  }
  React.useEffect(() => () => window.clearTimeout(searchTimer.current), []);

  const query = React.useCallback(
    (extra: { item?: string; cursor?: string } = {}) =>
      inboxQueryString({
        view,
        agent_slug: filters.agent_slug,
        kind: filters.kind,
        source_type: filters.source_type,
        q: filters.q,
        ...extra,
      }),
    [view, filters.agent_slug, filters.kind, filters.source_type, filters.q],
  );

  // History, not the router: the item is already on screen, and a router call
  // would ask the server for the whole page again.
  const writeAddress = React.useCallback(
    (id: string | null) => {
      window.history.replaceState(null, '', `/w/${workspaceSlug}/inbox?${query(id ? { item: id } : {})}`);
    },
    [workspaceSlug, query],
  );

  const navigate = React.useCallback(
    (next: InboxFilterValues, mode: 'push' | 'replace') => {
      const address = `/w/${workspaceSlug}/inbox?${inboxQueryString({ view, ...next })}`;
      startNavigation(() => {
        router[mode](address, { scroll: false });
      });
    },
    [router, view, workspaceSlug],
  );

  const onSearch = (value: string) => {
    setSearch(value);
    window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      navigate({ ...filters, q: value.trim() || undefined }, 'replace');
    }, SEARCH_PAUSE_MS);
  };
  const clearFilters = () => {
    window.clearTimeout(searchTimer.current);
    setSearch('');
    navigate({}, 'push');
  };

  /** Puts a fresher copy of an item into the list, leaving the unread dot as this screen has it. */
  const mergeIntoList = React.useCallback(
    (fresh: InboxItemView) => {
      setItems((current) => {
        if (view === 'needs_you' && fresh.state !== 'open') return current.filter((i) => i.id !== fresh.id);
        return current.map((i) => (i.id === fresh.id ? { ...fresh, unread: i.unread } : i));
      });
    },
    [view],
  );

  const refreshCounts = React.useCallback(async () => {
    try {
      const fresh = await apiRequest<InboxCountsView>(`${base}/inbox/counts`);
      if (isCounts(fresh)) setCounts(fresh);
    } catch {
      // The numbers on screen already moved with the decision; the sidebar's
      // own poll and the next open correct them if this call failed.
    }
  }, [base]);

  const fetchDetail = React.useCallback(
    async (id: string) => {
      if (!latest.current.details[id]) setLoadState((state) => ({ ...state, [id]: 'loading' }));
      try {
        const fresh = await apiRequest<InboxItemView>(`${base}/inbox/${id}`);
        if (!isItem(fresh, id)) throw new ApiError('Unexpected answer', 502);
        setDetails((current) => ({ ...current, [id]: fresh }));
        setLoadState((state) => {
          const rest = { ...state };
          delete rest[id];
          return rest;
        });
        mergeIntoList(fresh);
        return fresh;
      } catch (error) {
        // Something already on screen stays on screen; only a first load fails visibly.
        if (!latest.current.details[id]) setLoadState((state) => ({ ...state, [id]: { message: errorText(error) } }));
        return null;
      }
    },
    [base, errorText, mergeIntoList],
  );

  const markRead = React.useCallback(
    (id: string) => {
      const { items: listed, details: held } = latest.current;
      const source = listed.find((i) => i.id === id) ?? held[id];
      const unread = (listed.find((i) => i.id === id) ?? held[id])?.unread ?? false;
      if (!source || !unread) return;
      const setUnread = (value: boolean) => {
        setItems((current) => current.map((i) => (i.id === id ? { ...i, unread: value } : i)));
        setDetails((current) => (current[id] ? { ...current, [id]: { ...current[id], unread: value } } : current));
        setCounts((current) => countsAfterRead(current, source, value ? 1 : -1));
      };
      setUnread(false);
      void (async () => {
        try {
          await apiRequest(`${base}/inbox/${id}/read`, { method: 'POST' });
        } catch {
          // Not worth a toast: the dot simply comes back, and the next open tries again.
          setUnread(true);
        }
      })();
    },
    [base],
  );

  const openItem = React.useCallback(
    (id: string) => {
      setOpenId(id);
      setCursorId(id);
      writeAddress(id);
      void fetchDetail(id);
      markRead(id);
    },
    [fetchDetail, markRead, writeAddress],
  );

  const closeItem = React.useCallback(() => {
    setOpenId(null);
    writeAddress(null);
  }, [writeAddress]);

  // An item the page opened is read the moment it is shown.
  React.useEffect(() => {
    if (selectedItem) markRead(selectedItem.id);
    // Once, for the item the server rendered; later opens go through openItem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await apiRequest<InboxListView>(`${base}/inbox?${query({ cursor: nextCursor })}`);
      if (!isList(page)) throw new ApiError('Unexpected answer', 502);
      setItems((current) => [...current, ...page.items.filter((i) => !current.some((c) => c.id === i.id))]);
      setNextCursor(page.next_cursor);
    } catch (error) {
      snToast.error(errorText(error));
    } finally {
      setLoadingMore(false);
    }
  };

  /**
   * Sends a decision. The screen shows the result first, then asks the server:
   * on success the server's record replaces the guess, on a conflict (someone
   * else got there first) it shows their record, and on any other failure the
   * old state comes back and a toast says why.
   */
  const decide = async (action: DetailAction): Promise<boolean> => {
    const { openId: id, details: held, items: listed, counts: before } = latest.current;
    const item = id ? held[id] : undefined;
    if (!id || !item || busyId) return false;

    const decision: InboxDecision = action.type;
    let path: string;
    let body: unknown;
    if (action.type === 'answer' || action.type === 'skip') {
      if (!item.input_request) return false;
      path = `${base}/inbox/${id}/${action.type === 'answer' ? 'answer' : 'dismiss'}`;
      body = action.type === 'answer' ? { version: item.input_request.version, answers: action.answers } : undefined;
    } else {
      if (!item.approval) return false;
      const version = item.approval.version;
      if (action.type === 'changes') {
        path = `${base}/approvals/${item.approval.id}/changes`;
        body = { version, instruction: action.instruction };
      } else {
        path = `${base}/approvals/${item.approval.id}/decision`;
        body =
          action.type === 'approve'
            ? { version, decision: 'approve', ...(action.edited ? { edited_payload: action.edited } : {}) }
            : { version, decision: 'reject', ...(action.note ? { note: action.note } : {}) };
      }
    }

    // What this screen shows the instant the button is pressed.
    const guess = applyDecision(item, decision, new Date().toISOString(), currentUserId);
    const index = listed.findIndex((i) => i.id === id);
    const leaves = view === 'needs_you' && guess.state !== 'open';
    setBusyId(id);
    setDetails((current) => ({ ...current, [id]: guess }));
    setItems((current) => (leaves ? current.filter((i) => i.id !== id) : current.map((i) => (i.id === id ? { ...guess, unread: false } : i))));
    if (leaves) {
      setSettled({ from: id, next: listed[index + 1]?.id ?? listed[index - 1]?.id ?? null });
    }
    setCounts(countsAfterDecision(before, item, decision));
    if (decision !== 'changes') emitInboxChanged({ badge_delta: -1 });

    try {
      await apiRequest(path, { method: 'POST', ...(body !== undefined ? { body } : {}) });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        // Someone decided, or the draft changed, while this person was looking:
        // show the record as it is now instead of undoing it blindly.
        const fresh = await fetchDetail(id);
        if (fresh && fresh.state !== 'open') {
          setConflicts((current) => new Set(current).add(id));
          const who = fresh.approval?.decided_by_name;
          snToast.info(who ? t('toast_conflict', { name: who }) : t('toast_conflict_unknown'));
        } else {
          snToast.info(t('toast_changed'));
        }
        void refreshCounts();
        emitInboxChanged({ refetch: true });
        setBusyId(null);
        return false;
      }
      // Back to exactly how it was.
      setDetails((current) => ({ ...current, [id]: item }));
      setItems((current) => {
        if (current.some((i) => i.id === id)) return current.map((i) => (i.id === id ? item : i));
        const copy = [...current];
        copy.splice(Math.max(0, index), 0, item);
        return copy;
      });
      setSettled(null);
      setCounts(before);
      if (decision !== 'changes') emitInboxChanged({ badge_delta: 1 });
      snToast.error(
        errorText(error),
        error instanceof ApiError && error.retryable
          ? { action: { label: t('try_again'), onClick: () => void decide(action) } }
          : undefined,
      );
      setBusyId(null);
      return false;
    }

    // The server took it. Its record (with the real name and time) replaces the guess.
    await fetchDetail(id);
    await refreshCounts();
    emitInboxChanged({ refetch: true });
    setBusyId(null);
    return true;
  };

  // Keys. One listener for the whole screen; `shortcutFor` decides what a key
  // means and when to stay out of the way (fields, menus, dialogs, browser shortcuts).
  const onKey = (event: KeyboardEvent) => {
    const action = shortcutFor(event, shortcutTargetOf(event.target));
    if (!action) return;
    const { items: rows, cursorId: cursor, openId: open } = latest.current;
    const move = (step: 1 | -1) => {
      if (rows.length === 0) return;
      const at = rows.findIndex((i) => i.id === (cursor ?? open));
      const target = rows[at === -1 ? (step === 1 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, at + step))];
      if (!target) return;
      // Beside the list the detail follows the cursor; on a phone Enter opens.
      if (isWide()) openItem(target.id);
      else setCursorId(target.id);
    };
    switch (action) {
      case 'next':
        event.preventDefault();
        move(1);
        break;
      case 'previous':
        event.preventDefault();
        move(-1);
        break;
      case 'open':
        if (cursor) {
          event.preventDefault();
          openItem(cursor);
        }
        break;
      case 'approve':
        if (open) event.preventDefault();
        detailApi.current?.approve();
        break;
      case 'edit':
        if (open) event.preventDefault();
        detailApi.current?.edit();
        break;
      case 'reject':
        if (open) event.preventDefault();
        detailApi.current?.reject();
        break;
      case 'changes':
        if (open) event.preventDefault();
        detailApi.current?.changes();
        break;
      case 'back':
        if (detailApi.current?.closePanel()) event.preventDefault();
        else if (open) {
          event.preventDefault();
          closeItem();
        }
        break;
      case 'search':
        event.preventDefault();
        searchRef.current?.focus();
        break;
      case 'leave_field':
        (document.activeElement as HTMLElement | null)?.blur();
        break;
    }
  };
  const onKeyRef = React.useRef(onKey);
  onKeyRef.current = onKey;
  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => onKeyRef.current(event);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Keep the row the keys are on in view.
  React.useEffect(() => {
    if (!cursorId) return;
    const row = document.querySelector<HTMLElement>(`[data-item-id="${cursorId}"]`);
    row?.scrollIntoView?.({ block: 'nearest' });
  }, [cursorId]);

  const detail = openId ? (details[openId] ?? null) : null;
  const detailLoad = openId ? loadState[openId] : undefined;
  const everything = counts.needs_review + counts.needs_input + counts.updates + counts.done;
  const filtered = Boolean(filters.agent_slug || filters.kind || filters.source_type || filters.q);
  const firstRun = everything === 0 && !filtered && items.length === 0 && !listError;

  if (firstRun) {
    return <InboxFirstRun workspaceSlug={workspaceSlug} />;
  }

  return (
    <div data-open={openId ? 'true' : 'false'} className="flex min-h-0 flex-1">
      <div
        data-pane="list"
        data-hidden-mobile={openId ? 'true' : 'false'}
        className={cn(
          'min-h-0 w-full flex-col lg:flex lg:w-[380px] lg:shrink-0 lg:border-e lg:border-border xl:w-[420px]',
          openId ? 'hidden' : 'flex',
        )}
      >
        <InboxList
          workspaceSlug={workspaceSlug}
          view={view}
          counts={counts}
          readOnly={readOnly}
          specialists={specialists}
          filters={filters}
          search={search}
          searchRef={searchRef}
          onSearch={onSearch}
          onFilters={(next) => navigate(next, 'push')}
          onClear={clearFilters}
          items={items}
          error={listError || list === null}
          onRetry={() => router.refresh()}
          openId={openId}
          cursorId={cursorId}
          text={text}
          hasMore={nextCursor !== null}
          loadingMore={loadingMore}
          onLoadMore={() => void loadMore()}
          onOpen={openItem}
          pending={navigating}
        />
      </div>
      <div
        data-pane="detail"
        className={cn('min-h-0 min-w-0 flex-1 flex-col lg:flex', openId ? 'flex' : 'hidden')}
      >
        {openId === null ? (
          <InboxPickOne />
        ) : detail ? (
          <div key={detail.id} className="anim-pane flex min-h-0 flex-1 flex-col">
            <InboxDetail
              key={`${detail.id}:${detail.approval?.revision ?? 0}`}
              item={detail}
              workspaceSlug={workspaceSlug}
              readOnly={readOnly}
              currentUserId={currentUserId}
              text={text}
              busy={busyId === detail.id}
              conflict={conflicts.has(detail.id)}
              apiRef={detailApi}
              onDecide={decide}
              onBack={closeItem}
              onNext={settled && settled.from === detail.id && settled.next ? () => openItem(settled.next as string) : null}
            />
          </div>
        ) : detailLoad && detailLoad !== 'loading' ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <SNErrorState
              title={t('detail_error_title')}
              message={detailLoad.message}
              onRetry={() => void fetchDetail(openId)}
              retryLabel={t('try_again')}
            />
          </div>
        ) : (
          <div className="mx-auto w-full max-w-2xl space-y-4 p-6" aria-busy="true">
            <div className="flex items-center gap-3">
              <SNSkeleton variant="rect" className="size-11 rounded-sm" />
              <SNSkeleton variant="text" className="h-4 w-40" />
            </div>
            <SNSkeleton variant="text" className="h-6 w-2/3" />
            <SNSkeleton variant="rect" className="h-40 w-full rounded-md" />
          </div>
        )}
      </div>
    </div>
  );
}
