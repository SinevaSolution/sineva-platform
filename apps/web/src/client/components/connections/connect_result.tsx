'use client';

import { CircleAlert, CircleCheck, CircleSlash, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { SNButton, SNCard, SNSkeleton, snToast } from '@sineva/ui';
import { PageHeader } from '@/client/components/shell/page_header';
import { SNSpecialistTile } from '@/client/components/ui/sn_specialist_tile';
import { createConnectionsApi, type ConnectionsApi } from '@/client/lib/connections_api';
import { useLocale, useTranslations } from '@/i18n/provider';
import type { ConnectionView, ProviderView } from '@/shared/connections_view';
import type { ShellSpecialistView } from '@/shared/shell_view';
import { providerShortName, scopeLabel, type ResultQuery, type ResultVariant } from './connections_model';
import { ConsentSheet } from './consent_sheet';
import { ProviderLogoTile } from './provider_mark';

type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

const ICONS: Record<Tone, LucideIcon> = {
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleAlert,
  neutral: CircleSlash,
  info: Info,
};

const TONE_CLASS: Record<Tone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  neutral: 'text-text-tertiary',
  info: 'text-text-brand',
};

// Literal keys on purpose (see connections_model.ts).
const VARIANT: Record<ResultVariant, { tone: Tone; title: string; body: string }> = {
  connected: { tone: 'success', title: 'result.connected_title', body: 'result.connected_body' },
  partial: { tone: 'warning', title: 'result.partial_title', body: 'result.partial_body' },
  cancelled: { tone: 'neutral', title: 'result.cancelled_title', body: 'result.cancelled_body' },
  expired: { tone: 'warning', title: 'result.expired_title', body: 'result.expired_body' },
  provider_error: { tone: 'warning', title: 'result.provider_title', body: 'result.provider_body' },
  duplicate_account: { tone: 'info', title: 'result.duplicate_title', body: 'result.duplicate_body' },
  different_account: { tone: 'warning', title: 'result.different_title', body: 'result.different_body' },
};

/**
 * SCR-CONN-05. A calm, same-site page that says how the connect ended, with one
 * next step. It trusts nothing from the address bar except three short codes
 * (see `parseResultQuery`) and strips them after the first render so a refresh
 * or a shared link never replays a message. The details come from the server.
 */
export function ConnectResult({
  query,
  workspaceId,
  workspaceSlug,
  workspaceName,
  specialists,
  api: injected,
  navigate,
}: {
  query: ResultQuery;
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  specialists: ShellSpecialistView[];
  api?: ConnectionsApi;
  navigate?: (url: string) => void;
}) {
  const t = useTranslations('connections');
  const locale = useLocale();
  const api = React.useMemo(() => injected ?? createConnectionsApi(workspaceId), [injected, workspaceId]);
  const { variant, provider: providerSlug, connectionId } = query;
  const needsDetails = (variant === 'connected' || variant === 'partial') && connectionId !== null;

  const [details, setDetails] = React.useState<
    { status: 'loading' } | { status: 'failed' } | { status: 'ready'; connection: ConnectionView; provider: ProviderView }
  >(needsDetails ? { status: 'loading' } : { status: 'failed' });
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const announced = React.useRef(false);

  // Strip the codes so the page cannot be replayed, once.
  React.useEffect(() => {
    window.history.replaceState(null, '', `/w/${workspaceSlug}/tools/result`);
  }, [workspaceSlug]);

  React.useEffect(() => {
    if (!needsDetails || connectionId === null) return;
    let cancelled = false;
    Promise.all([api.getConnection(connectionId), api.listProviders()])
      .then(([connection, providers]) => {
        const provider = providers.find((p) => p.slug === connection.provider_slug);
        if (!cancelled) setDetails(provider ? { status: 'ready', connection, provider } : { status: 'failed' });
      })
      .catch(() => {
        if (!cancelled) setDetails({ status: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [api, connectionId, needsDetails]);

  React.useEffect(() => {
    headingRef.current?.focus();
  }, [details.status]);

  // The toast fires once per mount, when we know which app it is.
  React.useEffect(() => {
    if (variant === 'connected' && details.status === 'ready' && !announced.current) {
      announced.current = true;
      snToast.success(t('toast.connected', { app: details.provider.name }));
    }
  }, [variant, details, t]);

  if (needsDetails && details.status === 'loading') {
    return (
      <Frame title={t('title')}>
        <div aria-busy="true" className="space-y-3">
          <span className="sr-only">{t('common.loading')}</span>
          <SNSkeleton className="h-10 w-10" />
          <SNSkeleton className="h-6 w-64" />
          <SNSkeleton className="h-16 w-full" />
        </div>
      </Frame>
    );
  }

  const ready = details.status === 'ready' ? details : null;
  const provider = ready?.provider ?? null;
  const connection = ready?.connection ?? null;
  const app = provider?.name ?? t('result.this_tool');
  const short = provider ? providerShortName(provider) : app;
  const slug = provider?.slug ?? providerSlug;
  const { tone, title, body } = VARIANT[variant];
  const Icon = ICONS[tone];
  const tools = `/w/${workspaceSlug}/tools`;
  const connectAgain = slug ? `${tools}?connect=${slug}` : tools;
  const detail = connection ? `${tools}/${connection.id}` : tools;

  let primary: React.ReactNode;
  let secondary: React.ReactNode = (
    <SNButton asChild variant="ghost" size="lg">
      <Link href={tools}>{t('result.back')}</Link>
    </SNButton>
  );
  switch (variant) {
    case 'connected':
      primary = (
        <SNButton asChild variant="primary" size="lg">
          <Link href={detail}>{t('result.review')}</Link>
        </SNButton>
      );
      break;
    case 'partial':
      primary = provider && connection ? (
        <SNButton variant="primary" size="lg" onClick={() => setSheetOpen(true)}>
          {t('result.allow_missing')}
        </SNButton>
      ) : (
        <SNButton asChild variant="primary" size="lg">
          <Link href={tools}>{t('result.back')}</Link>
        </SNButton>
      );
      secondary = (
        <SNButton asChild variant="ghost" size="lg">
          <Link href={detail}>{t('result.keep')}</Link>
        </SNButton>
      );
      break;
    case 'duplicate_account':
      primary = (
        <SNButton asChild variant="primary" size="lg">
          <Link href={connectionId ? `${tools}/${connectionId}?reconnect=1` : tools}>
            {t('result.reconnect', { app: short })}
          </Link>
        </SNButton>
      );
      secondary = (
        <SNButton asChild variant="ghost" size="lg">
          <Link href={tools}>{t('result.keep_existing')}</Link>
        </SNButton>
      );
      break;
    case 'different_account':
      primary = (
        <SNButton asChild variant="primary" size="lg">
          <Link href={connectAgain}>{t('result.connect_new')}</Link>
        </SNButton>
      );
      secondary = (
        <SNButton asChild variant="ghost" size="lg">
          <Link href={detail}>{t('common.cancel')}</Link>
        </SNButton>
      );
      break;
    case 'cancelled':
    case 'provider_error':
      primary = (
        <SNButton asChild variant="primary" size="lg">
          <Link href={connectAgain}>{t('result.try_again')}</Link>
        </SNButton>
      );
      break;
    default:
      primary = (
        <SNButton asChild variant="primary" size="lg">
          <Link href={connectAgain}>{t('result.start_again')}</Link>
        </SNButton>
      );
  }

  const named = provider
    ? specialists.filter((s) => connection?.grants.some((g) => g.agent_slug === s.agent_slug && g.access_level !== 'none'))
    : [];

  return (
    <Frame title={provider?.name ?? t('title')}>
      <SNCard
        role="status"
        padding="lg"
        className="mx-auto w-full max-w-xl space-y-4 border-s-2 border-s-border-strong"
      >
        <div className="flex items-center gap-3">
          {provider ? <ProviderLogoTile slug={provider.slug} name={provider.name} decorative /> : null}
          <Icon aria-hidden="true" className={`size-6 ${TONE_CLASS[tone]}`} />
        </div>
        <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-text outline-none">
          {t(title, { app })}
        </h2>
        <p className="text-[15px] text-text-secondary">{t(body, { app })}</p>

        {variant === 'connected' && connection ? (
          <div className="space-y-3 text-sm">
            {connection.account_label ? (
              <p className="break-all text-text">{t('result.connected_as', { account: connection.account_label })}</p>
            ) : null}
            <p className="text-text-secondary">
              {t('result.shared_with')}:{' '}
              {connection.owner_scope === 'user' ? t('detail.only_you') : workspaceName}
            </p>
            <div>
              <p className="text-[13px] font-medium text-text">{t('access.sino_can_read')}</p>
              <ul className="mt-1 space-y-0.5 text-text-secondary">
                {connection.granted_scopes
                  .filter((s) => s.access_class === 'read')
                  .map((s) => (
                    <li key={s.key}>{scopeLabel(s, locale)}</li>
                  ))}
              </ul>
            </div>
            {named.length > 0 ? (
              <ul className="flex flex-wrap gap-3" aria-label={t('result.specialists_access')}>
                {named.map((s) => (
                  <li key={s.agent_slug} className="flex items-center gap-1.5 text-text">
                    <SNSpecialistTile agentSlug={s.agent_slug} name={s.display_name} size="sm" />
                    {s.display_name}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="text-text-tertiary">{t('result.changes_off')}</p>
          </div>
        ) : null}

        {variant === 'partial' && connection && connection.missing_scopes.length > 0 ? (
          <ul className="list-disc space-y-0.5 ps-5 text-sm text-text-secondary">
            {connection.missing_scopes.map((s) => (
              <li key={s.key}>{scopeLabel(s, locale)}</li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-col gap-2 pt-2 sm:flex-row-reverse sm:justify-start">
          {primary}
          {secondary}
        </div>
      </SNCard>

      {sheetOpen && provider && connection ? (
        <ConsentSheet
          open
          onOpenChange={(open) => {
            if (!open) setSheetOpen(false);
          }}
          provider={provider}
          reconnect={connection}
          workspaceName={workspaceName}
          workspaceSlug={workspaceSlug}
          specialists={specialists}
          api={api}
          navigate={navigate}
        />
      ) : null}
    </Frame>
  );
}

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={title} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
