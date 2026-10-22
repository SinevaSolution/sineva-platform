'use client';

import { ChevronDown, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { SNButton, SNErrorState, SNInput, SNSegmented, SNSkeleton } from '@sineva/ui';
import { PageHeader } from '@/client/components/shell/page_header';
import { PresetEmptyState } from '@/client/components/ui/empty_state';
import { createConnectionsApi, type ConnectionsApi } from '@/client/lib/connections_api';
import { useApiErrorText } from '@/client/lib/use_api_error';
import { useTranslations } from '@/i18n/provider';
import {
  FILTER_CATEGORIES,
  type ConnectionView,
  type FilterCategory,
  type ProviderView,
} from '@/shared/connections_view';
import type { ShellSpecialistView } from '@/shared/shell_view';
import { CATEGORY_KEYS, ComingSoonCard, ConnectedCard, ProviderCard } from './connection_cards';
import {
  connectKind,
  connectionStatusPresentation,
  filterProviders,
  providerConnections,
  providerState,
  type ConnectionsRole,
} from './connections_model';
import { ConsentSheet } from './consent_sheet';
import { SecretKeyDialog } from './secret_key_dialog';
import { useConnectionsData } from './use_connections_data';

const URL_DEBOUNCE_MS = 300;

/**
 * SCR-CONN-01. Hero line, filters, then Connected (one card per connection,
 * the ones that need attention first), Available and a collapsed Coming soon
 * group. Category and search live in the URL (`?category=`, `?q=`); `?connect=`
 * opens the connect sheet for a provider once (the return page links to it).
 */
export function ConnectionsCatalog({
  workspaceId,
  workspaceSlug,
  workspaceName,
  role,
  specialists,
  initialCategory = null,
  initialQuery = '',
  initialConnect = null,
  api: injected,
  navigate,
}: {
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  role: ConnectionsRole;
  specialists: ShellSpecialistView[];
  initialCategory?: FilterCategory | null;
  initialQuery?: string;
  initialConnect?: string | null;
  api?: ConnectionsApi;
  navigate?: (url: string) => void;
}) {
  const t = useTranslations('connections');
  const errorText = useApiErrorText();
  const router = useRouter();
  const api = React.useMemo(() => injected ?? createConnectionsApi(workspaceId), [injected, workspaceId]);
  const data = useConnectionsData(api);

  const [category, setCategory] = React.useState<FilterCategory | null>(initialCategory);
  const [query, setQuery] = React.useState(initialQuery);
  const [soonOpen, setSoonOpen] = React.useState(false);
  const [consent, setConsent] = React.useState<{ provider: ProviderView; reconnect: ConnectionView | null } | null>(null);
  const [keyFor, setKeyFor] = React.useState<{ provider: ProviderView; replace: ConnectionView | null } | null>(null);

  // The URL follows the filters after a pause; the filters themselves react at once.
  const basePath = `/w/${workspaceSlug}/tools`;
  React.useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (query.trim()) params.set('q', query.trim());
      const qs = params.toString();
      router.replace(qs ? `${basePath}?${qs}` : basePath, { scroll: false });
    }, URL_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [category, query, basePath, router]);

  // `?connect=slug`: the sheet for that provider opens once the catalog is
  // loaded, until it is closed. Derived, not set from an effect, so there is no
  // extra render and no flag to keep in sync.
  const [autoClosed, setAutoClosed] = React.useState(false);

  if (data.status === 'loading') {
    return (
      <Shell title={t('title')}>
        <div aria-busy="true" className="space-y-4">
          <span className="sr-only">{t('common.loading')}</span>
          <SNSkeleton className="h-10 w-full max-w-sm" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <SNSkeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        </div>
      </Shell>
    );
  }
  if (data.status === 'error') {
    return (
      <Shell title={t('title')}>
        <SNErrorState
          title={t('common.load_error_title')}
          message={errorText(data.error)}
          onRetry={data.reload}
          retryLabel={t('common.retry')}
        />
      </Shell>
    );
  }

  const providerBySlug = new Map(data.providers.map((p) => [p.slug, p]));
  const visible = filterProviders(data.providers, category, query);
  const visibleSlugs = new Set(visible.map((p) => p.slug));
  const live = data.connections
    .filter((c) => c.status !== 'revoked' && visibleSlugs.has(c.provider_slug))
    .sort(
      (a, b) =>
        Number(connectionStatusPresentation(b.status).attention) -
        Number(connectionStatusPresentation(a.status).attention),
    );
  const available = visible.filter((p) => {
    const kind = providerState(p, data.connections).kind;
    return providerConnections(p, data.connections).length === 0 && kind !== 'coming_soon';
  });
  const comingSoon = visible.filter(
    (p) => p.availability === 'coming_soon' && providerConnections(p, data.connections).length === 0,
  );
  const noneConnectedAtAll = data.connections.every((c) => c.status === 'revoked');
  const nothingMatches = visible.length === 0;
  const clearFilters = () => {
    setCategory(null);
    setQuery('');
  };

  const openProvider = (provider: ProviderView) => {
    const kind = connectKind(provider);
    if (kind === 'consent') setConsent({ provider, reconnect: null });
    else if (kind === 'secret') setKeyFor({ provider, replace: null });
  };
  // A key connection is reconnected by replacing its key; a sign-in one by signing in again.
  const reconnect = (connection: ConnectionView) => {
    const provider = providerBySlug.get(connection.provider_slug);
    if (!provider) return;
    const kind = connectKind(provider);
    if (kind === 'consent') setConsent({ provider, reconnect: connection });
    else if (kind === 'secret') setKeyFor({ provider, replace: connection });
  };

  const count = live.length + available.length + comingSoon.length;

  const autoProvider =
    !autoClosed && initialConnect
      ? (data.providers.find(
          (p) => p.slug === initialConnect && providerState(p, data.connections).kind === 'connect',
        ) ?? null)
      : null;
  const autoKind = autoProvider ? connectKind(autoProvider) : null;
  const consentView =
    consent ?? (autoProvider && autoKind === 'consent' ? { provider: autoProvider, reconnect: null } : null);
  const keyView = keyFor ?? (autoProvider && autoKind === 'secret' ? { provider: autoProvider, replace: null } : null);
  const closeSheets = () => {
    setConsent(null);
    setKeyFor(null);
    setAutoClosed(true);
  };

  return (
    <Shell title={t('title')}>
      <p className="max-w-2xl text-[15px] text-text-secondary">{t('hero')}</p>
      {role === 'viewer' ? <p className="text-[13px] text-text-tertiary">{t('common.view_only')}</p> : null}

      <div className="space-y-3">
        <div className="max-w-sm">
          <SNInput
            type="search"
            value={query}
            startAdornment={<Search />}
            aria-label={t('catalog.search_label')}
            placeholder={t('catalog.search_placeholder')}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setQuery('');
            }}
          />
        </div>
        <div className="overflow-x-auto pb-1 [scrollbar-width:none]">
          <SNSegmented
            aria-label={t('catalog.filter_label')}
            value={category ?? 'all'}
            onValueChange={(next) => setCategory(next === 'all' ? null : (next as FilterCategory))}
            options={[
              { value: 'all', label: t('category.all') },
              ...FILTER_CATEGORIES.map((c) => ({ value: c, label: t(CATEGORY_KEYS[c]) })),
            ]}
          />
        </div>
        <p role="status" className="sr-only">
          {t('catalog.result_count', { count })}
        </p>
      </div>

      {nothingMatches ? (
        <PresetEmptyState
          preset="connections_filtered"
          values={{ query: query.trim() || (category ? t(CATEGORY_KEYS[category]) : '') }}
          onAction={clearFilters}
        />
      ) : (
        <>
          <section aria-labelledby="tools-connected" className="space-y-3">
            <h2 id="tools-connected" className="text-[13px] font-semibold text-text">
              {t('section.connected')} ({live.length})
            </h2>
            {live.length > 0 ? (
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {live.map((c) => (
                  <li key={c.id}>
                    <ConnectedCard
                      connection={c}
                      provider={providerBySlug.get(c.provider_slug) ?? null}
                      workspaceSlug={workspaceSlug}
                      specialists={specialists}
                      onReconnect={reconnect}
                    />
                  </li>
                ))}
              </ul>
            ) : noneConnectedAtAll ? (
              <PresetEmptyState preset="connections_none" />
            ) : null}
          </section>

          {available.length > 0 ? (
            <section aria-labelledby="tools-available" className="space-y-3">
              <h2 id="tools-available" className="text-[13px] font-semibold text-text">
                {t('section.available')}
              </h2>
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {available.map((p) => (
                  <li key={p.slug}>
                    <ProviderCard
                      provider={p}
                      kind={providerState(p, data.connections).kind}
                      role={role}
                      specialists={specialists}
                      onConnect={openProvider}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {comingSoon.length > 0 ? (
            <section aria-labelledby="tools-soon" className="space-y-3">
              <h2 id="tools-soon" className="text-[13px] font-semibold text-text">
                <SNButton
                  variant="ghost"
                  size="sm"
                  aria-expanded={soonOpen}
                  aria-controls="tools-soon-list"
                  onClick={() => setSoonOpen((v) => !v)}
                >
                  <ChevronDown aria-hidden="true" className={soonOpen ? 'rotate-180' : undefined} />
                  {t('section.coming_soon', { count: comingSoon.length })}
                </SNButton>
              </h2>
              {soonOpen ? (
                <ul id="tools-soon-list" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {comingSoon.map((p) => (
                    <ComingSoonCard key={p.slug} provider={p} />
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
        </>
      )}

      {consentView ? (
        <ConsentSheet
          open
          onOpenChange={(open) => {
            if (!open) closeSheets();
          }}
          provider={consentView.provider}
          reconnect={consentView.reconnect}
          workspaceName={workspaceName}
          workspaceSlug={workspaceSlug}
          specialists={specialists}
          api={api}
          navigate={navigate}
        />
      ) : null}
      {keyView ? (
        <SecretKeyDialog
          open
          onOpenChange={(open) => {
            if (!open) closeSheets();
          }}
          provider={keyView.provider}
          replace={keyView.replace}
          api={api}
          onSaved={() => data.refresh()}
        />
      ) : null}
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={title} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
