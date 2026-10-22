'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { SNBanner, SNButton } from '@sineva/ui';
import { createConnectionsApi, type ConnectionsApi } from '@/client/lib/connections_api';
import { useTranslations } from '@/i18n/provider';
import type { ConnectionView } from '@/shared/connections_view';
import {
  bannerSnoozed,
  pickAttention,
  snoozeBanner,
  type ConnectionsRole,
} from './connections_model';
import { REFRESH_MS } from './use_connections_data';

interface AttentionValue {
  connections: ConnectionView[];
}

const AttentionContext = React.createContext<AttentionValue>({ connections: [] });

/**
 * One shared fetch of the workspace's connections for the banners (shell,
 * specialist screens). Viewers never fetch: no banner is ever theirs. A failed
 * refresh keeps what is shown and a failed first load shows no banner at all,
 * because this is a prompt, not content, and nothing is invented in its place.
 */
export function ConnectionsAttentionProvider({
  workspaceId,
  role,
  api: injected,
  children,
}: {
  workspaceId: string;
  role: ConnectionsRole;
  api?: ConnectionsApi;
  children: React.ReactNode;
}) {
  const api = React.useMemo(() => injected ?? createConnectionsApi(workspaceId), [injected, workspaceId]);
  const [connections, setConnections] = React.useState<ConnectionView[]>([]);

  React.useEffect(() => {
    if (role === 'viewer') return;
    let cancelled = false;
    const load = () =>
      api
        .listConnections()
        .then((list) => {
          if (!cancelled) setConnections(list);
        })
        .catch(() => undefined);
    void load();
    const timer = setInterval(load, REFRESH_MS);
    window.addEventListener('focus', load);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('focus', load);
    };
  }, [api, role]);

  const value = React.useMemo(() => ({ connections }), [connections]);
  return <AttentionContext.Provider value={value}>{children}</AttentionContext.Provider>;
}

export function useAttentionConnections(): ConnectionView[] {
  return React.useContext(AttentionContext).connections;
}

// Snoozing is stored in localStorage, which is an external system, so it is
// read through useSyncExternalStore: no effect, no flash, and the server render
// (which has no connections yet) never touches storage. Same-tab writes do not
// fire the `storage` event, hence the listener set.
const snoozeListeners = new Set<() => void>();
const subscribeSnooze = (listener: () => void) => {
  snoozeListeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    snoozeListeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
};

function useSnoozed(): [ReadonlySet<string>, (id: string) => void] {
  const connections = useAttentionConnections();
  const snapshot = React.useSyncExternalStore(
    subscribeSnooze,
    () => {
      try {
        const now = Date.now();
        return connections
          .filter((c) => bannerSnoozed(window.localStorage, c.id, now))
          .map((c) => c.id)
          .join(',');
      } catch {
        return '';
      }
    },
    () => '',
  );
  const snoozed = React.useMemo(() => new Set(snapshot ? snapshot.split(',') : []), [snapshot]);
  const hide = React.useCallback((id: string) => {
    try {
      snoozeBanner(window.localStorage, id, Date.now());
    } catch {
      /* keep showing */
    }
    snoozeListeners.forEach((listener) => listener());
  }, []);
  return [snoozed, hide];
}

function BannerBody({
  connections,
  workspaceSlug,
  className,
}: {
  connections: ConnectionView[];
  workspaceSlug: string;
  /** Spacing of the region that names the banner; it exists only while a banner does. */
  className: string;
}) {
  const t = useTranslations('connections');
  const [snoozed, hide] = useSnoozed();
  const pick = pickAttention(connections, snoozed);
  if (!pick) return null;
  const { primary, more } = pick;
  const app = primary.provider_name;
  const short = primary.provider_short_name ?? primary.provider_name;
  const text =
    primary.status === 'partial' ? t('banner.partial', { app }) : t('banner.needs_reconnect', { app });
  return (
    <div role="region" aria-label={t('banner.region_label')} className={className}>
    <SNBanner
      tone="warning"
      onDismiss={() => hide(primary.id)}
      dismissLabel={t('banner.hide')}
      action={
        (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {more > 0 ? (
              <SNButton asChild variant="link">
                <Link href={`/w/${workspaceSlug}/tools`}>{t('banner.more', { count: more })}</Link>
              </SNButton>
            ) : null}
            <SNButton asChild variant="secondary" size="sm">
              <Link href={`/w/${workspaceSlug}/tools/${primary.id}?reconnect=1`}>
                {t('banner.cta', { app: short })}
              </Link>
            </SNButton>
          </div>
        )
      }
    >
      {text}
    </SNBanner>
    </div>
  );
}

/**
 * The global slot under the top of the shell: one banner, the most severe
 * connection first. Not shown on the Connected tools pages (the cards already
 * say it) nor on specialist rooms and New chat, which carry their own.
 */
export function ShellReconnectBanner({
  role,
  workspaceSlug,
}: {
  role: ConnectionsRole;
  workspaceSlug: string;
}) {
  const connections = useAttentionConnections();
  const pathname = usePathname() ?? '';
  const base = `/w/${workspaceSlug}`;
  const hidden =
    pathname === `${base}/tools` ||
    pathname.startsWith(`${base}/tools/`) ||
    pathname === `${base}/new` ||
    pathname.startsWith(`${base}/chat/`);
  if (hidden || role === 'viewer' || connections.length === 0) return null;
  return (
    <BannerBody
      connections={connections}
      workspaceSlug={workspaceSlug}
      className="shrink-0 px-3 pt-3 sm:px-4"
    />
  );
}

/**
 * Inside a specialist's room or New chat: only the tools that specialist can
 * use, on an opaque surface (nothing is written on the room scene).
 */
export function RoomReconnectBanner({
  agentSlug,
  workspaceSlug,
}: {
  /** The specialist of this room; null in the team chat, which can use every tool. */
  agentSlug: string | null;
  workspaceSlug: string;
}) {
  const connections = useAttentionConnections();
  const theirs =
    agentSlug === null
      ? connections
      : connections.filter((c) =>
          c.grants.some((g) => g.agent_slug === agentSlug && g.access_level !== 'none'),
        );
  if (theirs.length === 0) return null;
  return (
    <BannerBody
      connections={theirs}
      workspaceSlug={workspaceSlug}
      className="px-4 pt-2 sm:px-6"
    />
  );
}
