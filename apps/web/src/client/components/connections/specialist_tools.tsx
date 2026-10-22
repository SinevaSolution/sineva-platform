'use client';

import { Blocks } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { SNBadge, SNButton, SNDrawer, SNErrorState, SNSkeleton } from '@sineva/ui';
import { PresetEmptyState } from '@/client/components/ui/empty_state';
import { createConnectionsApi, type ConnectionsApi } from '@/client/lib/connections_api';
import { useApiErrorText } from '@/client/lib/use_api_error';
import { useTranslations } from '@/i18n/provider';
import type { ConnectionView, ProviderView } from '@/shared/connections_view';
import { connectionStatusPresentation, specialistToolSummary } from './connections_model';
import { ProviderLogoTile } from './provider_mark';

type Loaded =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; connections: ConnectionView[]; providers: ProviderView[] };

/**
 * "Tools" on a specialist's room and New chat: which connected apps this
 * specialist can use and at what level, apps it could use but are not
 * connected yet, and a shortcut to manage access. Loads when opened, so a room
 * costs nothing until someone asks.
 */
export function SpecialistToolsButton({
  agentSlug,
  specialistName,
  workspaceId,
  workspaceSlug,
  api: injected,
}: {
  agentSlug: string;
  specialistName: string;
  workspaceId: string;
  workspaceSlug: string;
  api?: ConnectionsApi;
}) {
  const t = useTranslations('connections');
  const errorText = useApiErrorText();
  const api = React.useMemo(() => injected ?? createConnectionsApi(workspaceId), [injected, workspaceId]);
  const [open, setOpen] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  const [loaded, setLoaded] = React.useState<Loaded>({ status: 'loading' });

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([api.listConnections(), api.listProviders()])
      .then(([connections, providers]) => {
        if (!cancelled) setLoaded({ status: 'ready', connections, providers });
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoaded({ status: 'error', error });
      });
    return () => {
      cancelled = true;
    };
  }, [api, open, attempt]);

  const tools = `/w/${workspaceSlug}/tools`;
  const summary =
    loaded.status === 'ready'
      ? specialistToolSummary({ connections: loaded.connections, providers: loaded.providers, agentSlug })
      : null;

  return (
    <>
      <SNButton variant="secondary" size="sm" onClick={() => {
          setLoaded({ status: 'loading' });
          setOpen(true);
        }}
      >
        <Blocks aria-hidden="true" />
        {t('tools.button')}
      </SNButton>
      <SNDrawer
        open={open}
        onOpenChange={setOpen}
        title={t('tools.title', { name: specialistName })}
        showTitle
        side="end"
        width="panel"
        closeLabel={t('common.close')}
      >
        <div className="space-y-5 px-4 pb-6 pt-3">
          {loaded.status === 'loading' ? (
            <div aria-busy="true">
              <span className="sr-only">{t('common.loading')}</span>
              <SNSkeleton className="h-20 w-full" />
            </div>
          ) : null}
          {loaded.status === 'error' ? (
            <SNErrorState
              title={t('common.load_error_title')}
              message={errorText(loaded.error)}
              onRetry={() => {
                setLoaded({ status: 'loading' });
                setAttempt((n) => n + 1);
              }}
              retryLabel={t('common.retry')}
            />
          ) : null}
          {summary ? (
            <>
              {summary.using.length === 0 ? (
                <PresetEmptyState preset="specialist_tools_none" values={{ name: specialistName }} />
              ) : (
                <ul className="space-y-2">
                  {summary.using.map(({ connection, level }) => {
                    const status = connectionStatusPresentation(connection.status);
                    return (
                      <li key={connection.id} className="flex items-center gap-3 rounded-md border border-border bg-surface p-3">
                        <ProviderLogoTile slug={connection.provider_slug} name={connection.provider_name} decorative />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-text">{connection.provider_name}</p>
                          <p className="text-[12px] text-text-secondary">
                            {level === 'write' ? t('access.sino_can_change') : t('access.sino_can_read')}
                          </p>
                        </div>
                        {status.attention || connection.status === 'error' ? (
                          <SNBadge tone={status.tone}>{t(status.labelKey)}</SNBadge>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
              {summary.suggested.length > 0 ? (
                <section aria-labelledby="tools-suggested" className="space-y-2">
                  <h3 id="tools-suggested" className="text-[13px] font-semibold text-text">
                    {t('tools.not_connected', { name: specialistName })}
                  </h3>
                  <ul className="space-y-2">
                    {summary.suggested.map((p) => (
                      <li key={p.slug} className="flex items-center gap-3">
                        <ProviderLogoTile slug={p.slug} name={p.name} size="md" decorative />
                        <span className="min-w-0 flex-1 truncate text-sm text-text">{p.name}</span>
                        <SNButton asChild variant="secondary" size="sm">
                          <Link href={`${tools}?connect=${p.slug}`}>{t('card.connect', { app: p.short_name ?? p.name })}</Link>
                        </SNButton>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              <SNButton asChild variant="secondary">
                <Link href={tools}>{t('tools.manage')}</Link>
              </SNButton>
            </>
          ) : null}
        </div>
      </SNDrawer>
    </>
  );
}
