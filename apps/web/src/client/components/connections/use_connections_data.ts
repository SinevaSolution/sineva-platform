'use client';

import * as React from 'react';
import type { ConnectionsApi } from '@/client/lib/connections_api';
import type { ConnectionView, ProviderView } from '@/shared/connections_view';

export type ConnectionsData =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; providers: ProviderView[]; connections: ConnectionView[] };

/** Status is refreshed on tab focus and about every minute, never optimistically. */
export const REFRESH_MS = 60_000;

/**
 * Providers and connections for the catalog. The first load shows a skeleton;
 * later refreshes keep what is on screen and replace it quietly, so a slow
 * network does not blink the page. A failed refresh keeps the last good data.
 *
 * Fetched on mount rather than on the server because the Connections API is
 * reached only through the typed client module (`connections_api.ts`).
 */
export function useConnectionsData(
  api: ConnectionsApi,
): ConnectionsData & { reload: () => void; refresh: () => void } {
  const [state, setState] = React.useState<ConnectionsData>({ status: 'loading' });
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    const load = async (quiet: boolean) => {
      try {
        const [providers, connections] = await Promise.all([api.listProviders(), api.listConnections()]);
        if (!cancelled) setState({ status: 'ready', providers, connections });
      } catch (error) {
        if (!cancelled && !quiet) setState({ status: 'error', error });
      }
    };
    void load(false);
    const timer = setInterval(() => void load(true), REFRESH_MS);
    const onFocus = () => void load(true);
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [api, attempt]);

  // The skeleton comes back only on an explicit retry; the effect never sets
  // state synchronously.
  const reload = () => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  };
  // A quiet refresh keeps what is on screen (after a save, say).
  const refresh = () => setAttempt((n) => n + 1);
  return { ...state, reload, refresh };
}
