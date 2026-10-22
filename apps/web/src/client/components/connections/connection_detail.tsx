'use client';

import { ArrowLeft, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import {
  SNBadge,
  SNBanner,
  SNButton,
  SNCard,
  SNConfirmDialog,
  SNErrorState,
  SNSkeleton,
  snToast,
} from '@sineva/ui';
import { formatDate, formatRelativeTime } from '@sineva/ui/format';
import { PageHeader } from '@/client/components/shell/page_header';
import { PresetEmptyState } from '@/client/components/ui/empty_state';
import { SNSpecialistTile } from '@/client/components/ui/sn_specialist_tile';
import { ApiError } from '@/client/lib/api';
import { createConnectionsApi, type ConnectionsApi } from '@/client/lib/connections_api';
import { useApiErrorText } from '@/client/lib/use_api_error';
import { useLocale, useTranslations } from '@/i18n/provider';
import type {
  ActivityView,
  ConnectionView,
  GrantView,
  ProviderView,
} from '@/shared/connections_view';
import type { ShellSpecialistView } from '@/shared/shell_view';
import { AccessMatrix } from './access_matrix';
import { CATEGORY_KEYS } from './connection_cards';
import {
  activityLabelKey,
  activityOutcome,
  connectionStatusPresentation,
  providerShortName,
  scopeLabel,
  setAccess,
} from './connections_model';
import { ConsentSheet } from './consent_sheet';
import { ProviderLogoTile } from './provider_mark';
import { SecretKeyDialog } from './secret_key_dialog';

type Loaded =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; connection: ConnectionView; provider: ProviderView };

const sameGrants = (a: GrantView[], b: GrantView[]) => {
  const key = (g: GrantView[]) =>
    [...g]
      .filter((x) => x.access_level !== 'none')
      .map((x) => `${x.agent_slug}:${x.access_level}`)
      .sort()
      .join(',');
  return key(a) === key(b);
};

/**
 * SCR-CONN-08 on one page: account, who connected it and when, health with a
 * test and a reconnect, what Sino can read and change, the access matrix with
 * Save, recent activity and Disconnect. Sections instead of tabs so nothing a
 * person came here to fix is one click away.
 */
export function ConnectionDetail({
  workspaceId,
  workspaceSlug,
  workspaceName,
  connectionId,
  specialists,
  initialReconnect = false,
  api: injected,
  navigate,
}: {
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  connectionId: string;
  specialists: ShellSpecialistView[];
  initialReconnect?: boolean;
  api?: ConnectionsApi;
  navigate?: (url: string) => void;
}) {
  const t = useTranslations('connections');
  const locale = useLocale();
  const errorText = useApiErrorText();
  const router = useRouter();
  const api = React.useMemo(() => injected ?? createConnectionsApi(workspaceId), [injected, workspaceId]);

  const [loaded, setLoaded] = React.useState<Loaded>({ status: 'loading' });
  const [attempt, setAttempt] = React.useState(0);
  const [draft, setDraft] = React.useState<GrantView[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [allowFor, setAllowFor] = React.useState<string | null>(null);
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<'ok' | 'failed' | null>(null);
  const [reconnectOpen, setReconnectOpen] = React.useState(initialReconnect);
  const [keyOpen, setKeyOpen] = React.useState(false);
  const [disconnectOpen, setDisconnectOpen] = React.useState(false);
  const [disconnecting, setDisconnecting] = React.useState(false);
  const [disconnectError, setDisconnectError] = React.useState<string | null>(null);
  const [showRaw, setShowRaw] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    Promise.all([api.getConnection(connectionId), api.listProviders()])
      .then(([connection, providers]) => {
        if (cancelled) return;
        const provider = providers.find((p) => p.slug === connection.provider_slug);
        if (!provider) {
          setLoaded({ status: 'missing' });
          return;
        }
        setLoaded({ status: 'ready', connection, provider });
        setDraft(connection.grants);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoaded(
          error instanceof ApiError && error.status === 404
            ? { status: 'missing' }
            : { status: 'error', error },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [api, connectionId, attempt]);

  const title = loaded.status === 'ready' ? loaded.provider.name : t('title');

  if (loaded.status === 'loading') {
    return (
      <Frame title={title} workspaceSlug={workspaceSlug}>
        <div aria-busy="true" className="space-y-4">
          <span className="sr-only">{t('common.loading')}</span>
          <SNSkeleton className="h-12 w-72" />
          <SNSkeleton className="h-28 w-full" />
          <SNSkeleton className="h-52 w-full" />
        </div>
      </Frame>
    );
  }
  if (loaded.status === 'missing') {
    return (
      <Frame title={title} workspaceSlug={workspaceSlug}>
        <PresetEmptyState preset="not_found" actionHref={`/w/${workspaceSlug}/tools`} />
      </Frame>
    );
  }
  if (loaded.status === 'error') {
    return (
      <Frame title={title} workspaceSlug={workspaceSlug}>
        <SNErrorState
          title={t('common.load_error_title')}
          message={errorText(loaded.error)}
          onRetry={() => {
            setLoaded({ status: 'loading' });
            setAttempt((n) => n + 1);
          }}
          retryLabel={t('common.retry')}
        />
      </Frame>
    );
  }

  const { connection, provider } = loaded;
  const short = providerShortName(provider);
  const status = connectionStatusPresentation(connection.status);
  const revoked = connection.status === 'revoked';
  // Every permission comes from the server's `can` flags for this connection.
  const can = connection.can;
  const nameOf = (slug: string) => specialists.find((s) => s.agent_slug === slug)?.display_name ?? slug;
  const dirty = !sameGrants(draft, connection.grants);
  const readScopes = connection.granted_scopes.filter((s) => s.access_class === 'read');
  const changeScopes = connection.granted_scopes.filter((s) => s.access_class !== 'read');
  const withAccess = connection.grants.filter((g) => g.access_level !== 'none');
  const writeBundle = provider.bundles.find((b) => b.access_class === 'write');
  const attention = connection.status === 'needs_reconnect' || connection.status === 'partial';

  async function save() {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await api.updateGrants(connection.id, draft);
      setLoaded({ status: 'ready', connection: { ...connection, grants: saved }, provider });
      setDraft(saved);
      snToast.success(t('matrix.saved'));
    } catch (error) {
      setSaveError(errorText(error));
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.testConnection(connection.id);
      setTestResult(result.ok ? 'ok' : 'failed');
      setAttempt((n) => n + 1);
    } catch (error) {
      setTestResult('failed');
      snToast.error(errorText(error));
    } finally {
      setTesting(false);
    }
  }

  async function disconnect() {
    setDisconnecting(true);
    setDisconnectError(null);
    try {
      const result = await api.disconnect(connection.id);
      setDisconnectOpen(false);
      if (result.provider_revoked) snToast.success(t('disconnect.done', { app: provider.name }));
      else snToast.warning(t('disconnect.done_not_revoked', { app: provider.name }));
      router.push(`/w/${workspaceSlug}/tools`);
    } catch (error) {
      setDisconnectError(errorText(error));
    } finally {
      setDisconnecting(false);
    }
  }

  function toggle(slug: string, kind: 'read' | 'write', on: boolean) {
    if (kind === 'write' && on) {
      setAllowFor(slug);
      return;
    }
    setDraft((prev) => setAccess(prev, slug, kind, on));
  }

  const when = (value: string | null) =>
    value ? formatDate(value, locale, { dateStyle: 'medium', timeStyle: 'short' }) : null;

  return (
    <Frame title={title} workspaceSlug={workspaceSlug}>
      <header className="flex flex-wrap items-center gap-3">
        <ProviderLogoTile slug={provider.slug} name={provider.name} size="xl" decorative />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <SNBadge tone={status.tone}>{t(status.labelKey)}</SNBadge>
            <SNBadge>{connection.owner_scope === 'user' ? t('card.only_you') : t('card.shared')}</SNBadge>
            <span className="text-[13px] text-text-tertiary">{t(CATEGORY_KEYS[provider.category])}</span>
          </div>
          {connection.account_label ? (
            <p className="break-all text-sm text-text-secondary">
              {t('detail.connected_as', { account: connection.account_label })}
            </p>
          ) : null}
        </div>
        {!revoked && attention && can.reconnect ? (
          <SNButton variant="primary" onClick={() => setReconnectOpen(true)}>
            {connection.status === 'partial' ? t('detail.allow_missing') : t('detail.reconnect', { app: short })}
          </SNButton>
        ) : null}
        {revoked ? (
          <SNButton asChild variant="primary">
            <Link href={`/w/${workspaceSlug}/tools?connect=${provider.slug}`}>
              {t('detail.connect_again', { app: short })}
            </Link>
          </SNButton>
        ) : null}
      </header>

      {!can.grant ? <p className="text-[13px] text-text-tertiary">{t('common.view_only')}</p> : null}

      {revoked ? (
        <SNBanner tone="info">
          {t('detail.revoked', { date: when(connection.revoked_at) ?? '' })}
        </SNBanner>
      ) : connection.status === 'needs_reconnect' ? (
        <SNBanner tone="warning">{t('detail.banner_needs_reconnect', { app: provider.name })}</SNBanner>
      ) : connection.status === 'partial' ? (
        <SNBanner tone="warning">{t('detail.banner_partial', { app: provider.name })}</SNBanner>
      ) : connection.status === 'error' ? (
        <SNBanner tone="warning">{t('detail.banner_error', { app: provider.name })}</SNBanner>
      ) : null}

      {!revoked ? (
        <section aria-labelledby="detail-health" className="space-y-2">
          <h2 id="detail-health" className="text-[13px] font-semibold text-text">
            {t('detail.health')}
          </h2>
          <SNCard className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-text">
                {connection.status === 'connected'
                  ? t('detail.health_working')
                  : connection.status === 'needs_reconnect'
                    ? t('status.needs_reconnect')
                    : t(status.labelKey)}
              </p>
              <p className="text-[13px] text-text-secondary">
                {connection.last_health_at ? (
                  <>
                    {t('detail.last_checked', {
                      time: formatRelativeTime(connection.last_health_at, locale),
                    })}
                    <span className="sr-only"> ({when(connection.last_health_at)})</span>
                  </>
                ) : (
                  t('detail.never_checked')
                )}
              </p>
              <p role="status" className="text-[13px] text-text-secondary">
                {testResult === 'ok'
                  ? t('detail.test_ok')
                  : testResult === 'failed'
                    ? t('detail.test_failed', { app: provider.name })
                    : ''}
              </p>
            </div>
            {can.test ? (
              <SNButton variant="secondary" loading={testing} onClick={() => void runTest()}>
                {testing ? t('detail.testing') : t('detail.test')}
              </SNButton>
            ) : null}
          </SNCard>
        </section>
      ) : null}

      <section aria-labelledby="detail-can" className="space-y-2">
        <h2 id="detail-can" className="text-[13px] font-semibold text-text">
          {t('detail.what_sino_can_do')}
        </h2>
        <SNCard className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <h3 className="text-[13px] font-medium text-text">{t('access.sino_can_read')}</h3>
            <ul className="space-y-1 text-sm text-text-secondary">
              {readScopes.map((s) => (
                <li key={s.key}>{scopeLabel(s, locale)}</li>
              ))}
            </ul>
            {readScopes.length === 0 && <p className="text-sm text-text-secondary">{t('consent.nothing')}</p>}
          </div>
          <div className="space-y-1.5">
            <h3 className="text-[13px] font-medium text-text">{t('access.sino_can_change')}</h3>
            <ul className="space-y-1 text-sm text-text-secondary">
              {changeScopes.map((s) => (
                <li key={s.key}>{scopeLabel(s, locale)}</li>
              ))}
            </ul>
            {changeScopes.length === 0 && (
              <p className="text-sm text-text-secondary">{t('detail.changes_not_allowed')}</p>
            )}
          </div>
          {connection.missing_scopes.length > 0 ? (
            <div className="space-y-1.5 sm:col-span-2">
              <h3 className="text-[13px] font-medium text-text">{t('detail.not_allowed_yet')}</h3>
              <ul className="space-y-1 text-sm text-text-secondary">
                {connection.missing_scopes.map((s) => (
                  <li key={s.key}>{scopeLabel(s, locale)}</li>
                ))}
              </ul>
              {can.reconnect && !revoked ? (
                <SNButton variant="link" onClick={() => setReconnectOpen(true)}>
                  {t('detail.allow')}
                </SNButton>
              ) : null}
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <SNButton variant="link" aria-expanded={showRaw} onClick={() => setShowRaw((v) => !v)}>
              {t('consent.technical')}
            </SNButton>
            {showRaw ? (
              <ul className="mt-1.5 space-y-0.5 font-mono text-[12px] text-text-tertiary">
                {connection.granted_scopes.map((s) => (
                  <li key={s.key} className="break-all">
                    {s.key}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </SNCard>
      </section>

      {!revoked ? (
        <section aria-labelledby="detail-access" className="space-y-2">
          <h2 id="detail-access" className="text-[13px] font-semibold text-text">
            {t('matrix.title', { app: provider.name })}
          </h2>
          <SNCard>
            <AccessMatrix provider={provider} specialists={specialists} grants={draft} canGrant={can.grant} onToggle={toggle} />
            {saveError ? (
              <div className="pt-3">
                <SNBanner tone="danger">{saveError}</SNBanner>
              </div>
            ) : null}
            {can.grant ? (
              <div className="flex justify-end gap-2 pt-3">
                {dirty ? (
                  <SNButton variant="ghost" disabled={saving} onClick={() => setDraft(connection.grants)}>
                    {t('matrix.discard')}
                  </SNButton>
                ) : null}
                <SNButton variant="primary" loading={saving} disabled={!dirty} onClick={() => void save()}>
                  {saving ? t('common.saving') : t('matrix.save')}
                </SNButton>
              </div>
            ) : null}
          </SNCard>
        </section>
      ) : null}

      <section aria-labelledby="detail-about" className="space-y-2">
        <h2 id="detail-about" className="text-[13px] font-semibold text-text">
          {t('detail.details')}
        </h2>
        <SNCard>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[13px] text-text-tertiary">{t('detail.shared_with')}</dt>
              <dd className="text-text">{connection.owner_scope === 'user' ? t('detail.only_you') : workspaceName}</dd>
            </div>
            {connection.connected_by_name ? (
              <div>
                <dt className="text-[13px] text-text-tertiary">{t('detail.connected_by')}</dt>
                <dd className="text-text">{connection.connected_by_name}</dd>
              </div>
            ) : null}
            {connection.connected_at ? (
              <div>
                <dt className="text-[13px] text-text-tertiary">{t('detail.connected_on')}</dt>
                <dd className="text-text">{when(connection.connected_at)}</dd>
              </div>
            ) : null}
            {connection.secret_rotation_due_at ? (
              <div>
                <dt className="text-[13px] text-text-tertiary">{t('detail.key_due')}</dt>
                <dd className="text-text">{when(connection.secret_rotation_due_at)}</dd>
              </div>
            ) : null}
            {withAccess.length > 0 ? (
              <div className="sm:col-span-2">
                <dt className="text-[13px] text-text-tertiary">{t('detail.used_by')}</dt>
                <dd className="mt-1 flex flex-wrap gap-2">
                  {withAccess.map((g) => (
                    <span key={g.agent_slug} className="flex items-center gap-1.5 text-text">
                      <SNSpecialistTile agentSlug={g.agent_slug} name={nameOf(g.agent_slug)} size="sm" />
                      {nameOf(g.agent_slug)}
                    </span>
                  ))}
                </dd>
              </div>
            ) : null}
          </dl>
        </SNCard>
      </section>

      {can.view_activity ? (
        <ActivitySection api={api} connectionId={connection.id} />
      ) : null}

      {!revoked && (can.reconnect || can.disconnect) ? (
        <section aria-labelledby="detail-settings" className="space-y-2">
          <h2 id="detail-settings" className="text-[13px] font-semibold text-text">
            {t('detail.settings')}
          </h2>
          <SNCard className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {provider.auth_type !== 'oauth' ? (
                <SNButton variant="secondary" onClick={() => setKeyOpen(true)}>
                  {t('detail.replace_key')}
                </SNButton>
              ) : null}
              {attention || provider.auth_type === 'oauth' ? (
                <SNButton variant="secondary" onClick={() => setReconnectOpen(true)}>
                  {t('detail.reconnect', { app: short })}
                </SNButton>
              ) : null}
            </div>
            {can.disconnect ? (
              <SNButton variant="danger" onClick={() => setDisconnectOpen(true)}>
                <Trash2 aria-hidden="true" />
                {t('detail.disconnect')}
              </SNButton>
            ) : null}
          </SNCard>
        </section>
      ) : null}

      <SNConfirmDialog
        open={allowFor !== null}
        onOpenChange={(open) => {
          if (!open) setAllowFor(null);
        }}
        title={t('allow.title', { name: allowFor ? nameOf(allowFor) : '', app: provider.name })}
        description={
          writeBundle && writeBundle.scopes.length > 0
            ? t('allow.body', {
                name: allowFor ? nameOf(allowFor) : '',
                items: writeBundle.scopes.map((s) => scopeLabel(s, locale)).join(', '),
              })
            : t('allow.body_generic', { name: allowFor ? nameOf(allowFor) : '' })
        }
        confirmLabel={t('allow.cta')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => {
          if (allowFor) setDraft((prev) => setAccess(prev, allowFor, 'write', true));
          setAllowFor(null);
        }}
      />

      <SNConfirmDialog
        open={disconnectOpen}
        onOpenChange={setDisconnectOpen}
        title={t('disconnect.title', { app: provider.name })}
        description={
          withAccess.length > 0
            ? t('disconnect.body', {
                app: provider.name,
                names: withAccess.map((g) => nameOf(g.agent_slug)).join(', '),
              })
            : t('disconnect.body_nobody', { app: provider.name })
        }
        confirmLabel={t('disconnect.cta', { app: short })}
        cancelLabel={t('common.cancel')}
        destructive
        pending={disconnecting}
        pendingLabel={t('disconnect.pending')}
        error={disconnectError}
        onConfirm={() => void disconnect()}
      />

      {reconnectOpen ? (
        <ConsentSheet
          open
          onOpenChange={(open) => {
            if (!open) setReconnectOpen(false);
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
      {keyOpen ? (
        <SecretKeyDialog
          open
          onOpenChange={(open) => {
            if (!open) setKeyOpen(false);
          }}
          provider={provider}
          api={api}
          replace={connection}
          onSaved={() => setAttempt((n) => n + 1)}
        />
      ) : null}
    </Frame>
  );
}

function ActivitySection({ api, connectionId }: { api: ConnectionsApi; connectionId: string }) {
  const t = useTranslations('connections');
  const locale = useLocale();
  const errorText = useApiErrorText();
  const [items, setItems] = React.useState<ActivityView[] | null>(null);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [more, setMore] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    api
      .listActivity(connectionId)
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
        setCursor(page.next_cursor);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorText(e));
      });
    return () => {
      cancelled = true;
    };
    // `errorText` is a new function each render; the call itself must not re-run on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, connectionId]);

  async function loadMore(from: string) {
    setMore(true);
    setError(null);
    try {
      const page = await api.listActivity(connectionId, from);
      setItems((prev) => [...(prev ?? []), ...page.items]);
      setCursor(page.next_cursor);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setMore(false);
    }
  }

  return (
    <section aria-labelledby="detail-activity" className="space-y-2">
      <h2 id="detail-activity" className="text-[13px] font-semibold text-text">
        {t('activity.title')}
      </h2>
      <SNCard>
        {error ? <SNBanner tone="danger">{error}</SNBanner> : null}
        {items === null && !error ? <SNSkeleton className="h-16 w-full" /> : null}
        {items !== null && items.length === 0 ? <PresetEmptyState preset="connections_activity" /> : null}
        {items !== null && items.length > 0 ? (
          <ul className="divide-y divide-border">
            {items.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
                <span className="w-40 shrink-0 text-[13px] text-text-secondary">
                  {formatDate(a.occurred_at, locale, { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
                <span className="min-w-0 flex-1 text-text">{t(activityLabelKey(a.action))}</span>
                {activityOutcome(a.outcome) ? (
                  <SNBadge tone={activityOutcome(a.outcome)!.tone}>{t(activityOutcome(a.outcome)!.labelKey)}</SNBadge>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {cursor ? (
          <div className="pt-2">
            <SNButton variant="ghost" size="sm" loading={more} onClick={() => void loadMore(cursor)}>
              {t('activity.more')}
            </SNButton>
          </div>
        ) : null}
      </SNCard>
    </section>
  );
}

function Frame({
  title,
  workspaceSlug,
  children,
}: {
  title: string;
  workspaceSlug: string;
  children: React.ReactNode;
}) {
  const t = useTranslations('connections');
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title={title}
        leading={
          <SNButton asChild variant="ghost" size="sm">
            <Link href={`/w/${workspaceSlug}/tools`}>
              <ArrowLeft aria-hidden="true" />
              {t('title')}
            </Link>
          </SNButton>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
