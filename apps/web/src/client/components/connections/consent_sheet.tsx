'use client';

import { ArrowRight, ShieldCheck } from 'lucide-react';
import * as React from 'react';
import {
  SNBanner,
  SNButton,
  SNCheckbox,
  SNDrawer,
  SNRadioGroup,
  SNSpinner,
} from '@sineva/ui';
import { SNSpecialistTile } from '@/client/components/ui/sn_specialist_tile';
import type { ConnectionsApi } from '@/client/lib/connections_api';
import { useLocale, useTranslations } from '@/i18n/provider';
import type { ConnectionOwnerScope, ConnectionView, ProviderView } from '@/shared/connections_view';
import type { ShellSpecialistView } from '@/shared/shell_view';
import {
  bundleScopeGroups,
  providerShortName,
  scopeBundleFor,
  scopeLabel,
  startErrorKind,
  type StartErrorKind,
} from './connections_model';
import { ProviderLogoTile } from './provider_mark';

/** The hand-off shows a manual link when the redirect has not happened by then. */
export const HANDOFF_SLOW_MS = 8_000;

/**
 * What Sino will be able to do, in plain words, before anyone is sent to the
 * provider. Never skipped, reconnect included. Nothing exists on the server
 * until the primary button is pressed, so closing the sheet discards nothing.
 */
export function ConsentSheet({
  open,
  onOpenChange,
  provider,
  workspaceName,
  workspaceSlug,
  specialists,
  api,
  reconnect = null,
  navigate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: ProviderView;
  workspaceName: string;
  workspaceSlug: string;
  specialists: ShellSpecialistView[];
  api: ConnectionsApi;
  /** Set to reconnect an existing connection (keeps its id and grants). */
  reconnect?: ConnectionView | null;
  /** Leaves the app for the provider. Injected by tests; defaults to a full navigation. */
  navigate?: (url: string) => void;
}) {
  const t = useTranslations('connections');
  const locale = useLocale();
  const short = providerShortName(provider);
  // The server says which kinds of connection this person may create here.
  const workspaceAllowed = provider.can_connect_workspace;
  const personalAllowed = provider.can_connect_personal;

  const [ownerScope, setOwnerScope] = React.useState<ConnectionOwnerScope>(
    workspaceAllowed ? 'workspace' : 'user',
  );
  const [writeSelected, setWriteSelected] = React.useState(false);
  const [showRaw, setShowRaw] = React.useState(false);
  const [phase, setPhase] = React.useState<'consent' | 'handoff'>('consent');
  const [starting, setStarting] = React.useState(false);
  const [error, setError] = React.useState<StartErrorKind | null>(null);
  const [authorizeUrl, setAuthorizeUrl] = React.useState<string | null>(null);
  const [slow, setSlow] = React.useState(false);

  const isReconnect = reconnect !== null;
  const scope: ConnectionOwnerScope = isReconnect ? reconnect.owner_scope : ownerScope;
  // A reconnect keeps the access level the connection had (a write grant, or a
  // missing change permission, asks for the write tier again).
  const hadWrite =
    (reconnect?.grants.some((g) => g.access_level === 'write') ?? false) ||
    (reconnect?.missing_scopes.some((m) => m.access_class !== 'read') ?? false);
  const canOfferWrite = !isReconnect && workspaceAllowed && scope === 'workspace' && provider.write_supported;
  const includeWrite = isReconnect ? hadWrite : writeSelected && canOfferWrite;

  const groups = bundleScopeGroups(provider, includeWrite);
  const readScopes = groups.read;
  const writeScopes = groups.change;
  const named = specialists.filter((s) => provider.specialists.includes(s.agent_slug));

  // Back to a clean first step whenever the sheet closes, so reopening it never
  // shows a stale hand-off or error.
  function handleOpenChange(next: boolean) {
    if (!next) {
      setPhase('consent');
      setError(null);
      setStarting(false);
      setSlow(false);
      setAuthorizeUrl(null);
    }
    onOpenChange(next);
  }

  React.useEffect(() => {
    if (phase !== 'handoff') return;
    const timer = setTimeout(() => setSlow(true), HANDOFF_SLOW_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  async function start() {
    if (starting) return;
    setStarting(true);
    setError(null);
    const returnTo = `/w/${workspaceSlug}/tools/result`;
    try {
      const bundleKey = scopeBundleFor(provider, includeWrite);
      if (!bundleKey) throw new Error('provider has no access tier to ask for');
      const url = reconnect
        ? await api.reconnect(reconnect.id, { return_to: returnTo, bundle_key: bundleKey })
        : await api.startOAuth({
            provider: provider.slug,
            owner_scope: ownerScope,
            bundle_key: bundleKey,
            return_to: returnTo,
          });
      setAuthorizeUrl(url);
      setPhase('handoff');
      // One painted frame of the hand-off screen before the page unloads.
      requestAnimationFrame(() => (navigate ?? ((u: string) => window.location.assign(u)))(url));
    } catch (e) {
      setError(startErrorKind(e));
    } finally {
      setStarting(false);
    }
  }

  const title = isReconnect
    ? t('consent.reconnect_title', { app: provider.name })
    : t('consent.title', { app: provider.name, workspace: workspaceName });

  return (
    <SNDrawer
      open={open}
      onOpenChange={handleOpenChange}
      title={phase === 'handoff' ? t('handoff.title', { app: provider.name }) : title}
      showTitle
      side="end"
      width="panel"
      closeLabel={t('common.close')}
    >
      <div className="flex h-[calc(100%-3rem)] flex-col">
        {phase === 'handoff' ? (
          <div role="status" className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <div className="flex items-center gap-3">
              <ProviderLogoTile slug={provider.slug} name={provider.name} decorative />
              <ArrowRight aria-hidden="true" className="size-4 text-text-tertiary" />
              <span aria-hidden="true" className="text-sm font-semibold text-text-brand">
                Sineva
              </span>
            </div>
            <SNSpinner size="lg" />
            <p className="max-w-xs text-sm text-text-secondary">{t('handoff.body')}</p>
            {slow && authorizeUrl ? (
              <div className="space-y-1">
                <p className="text-[13px] text-text-secondary">{t('handoff.slow', { app: provider.name })}</p>
                <SNButton asChild variant="link">
                  <a href={authorizeUrl}>
                    {t('handoff.continue', { app: provider.name })} ({new URL(authorizeUrl, 'http://localhost').host})
                  </a>
                </SNButton>
              </div>
            ) : null}
            <SNButton variant="ghost" onClick={() => handleOpenChange(false)}>
              {t('common.cancel')}
            </SNButton>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-4 pt-3">
              <div className="flex items-center gap-3">
                <ProviderLogoTile slug={provider.slug} name={provider.name} decorative />
                <ArrowRight aria-hidden="true" className="size-4 text-text-tertiary" />
                <span aria-hidden="true" className="text-sm font-semibold text-text-brand">
                  Sineva
                </span>
              </div>

              {error ? (
                <SNBanner tone={error === 'failed' ? 'danger' : 'warning'}>
                  {error === 'rate_limited'
                    ? t('consent.error_rate_limited')
                    : error === 'unavailable'
                      ? t('consent.error_unavailable', { app: provider.name })
                      : t('consent.error_start')}
                </SNBanner>
              ) : null}

              {isReconnect ? (
                <p className="text-sm text-text-secondary">
                  {scope === 'user' ? t('consent.scope_personal_fixed') : t('consent.scope_workspace_fixed', { workspace: workspaceName })}
                </p>
              ) : workspaceAllowed && personalAllowed ? (
                <SNRadioGroup
                  name="owner_scope"
                  variant="cards"
                  aria-label={t('consent.owner_scope')}
                  value={ownerScope}
                  onValueChange={(v) => setOwnerScope(v as ConnectionOwnerScope)}
                  options={[
                    { value: 'workspace', label: t('consent.scope_workspace', { workspace: workspaceName }) },
                    { value: 'user', label: t('consent.scope_personal') },
                  ]}
                />
              ) : (
                <p className="text-sm text-text-secondary">
                  {scope === 'user' ? t('consent.scope_personal_fixed') : t('consent.scope_workspace_fixed', { workspace: workspaceName })}
                </p>
              )}

              {canOfferWrite ? (
                <div className="rounded-md border border-border-strong bg-surface px-3">
                  <SNCheckbox
                    label={t('consent.allow_changes')}
                    checked={writeSelected}
                    onCheckedChange={setWriteSelected}
                  />
                </div>
              ) : null}

              <section aria-labelledby="consent-read" className="space-y-1.5">
                <h3 id="consent-read" className="text-[13px] font-semibold text-text">
                  {t('access.can_read')}
                </h3>
                <ul className="space-y-1 text-sm text-text-secondary">
                  {readScopes.map((s) => (
                    <li key={s.key}>{scopeLabel(s, locale)}</li>
                  ))}
                </ul>
              </section>
              <section aria-labelledby="consent-write" className="space-y-1.5">
                <h3 id="consent-write" className="text-[13px] font-semibold text-text">
                  {t('access.can_change')}
                </h3>
                {writeScopes.length > 0 ? (
                  <ul className="space-y-1 text-sm text-text-secondary">
                    {writeScopes.map((s) => (
                      <li key={s.key}>{scopeLabel(s, locale)}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-text-secondary">{t('consent.nothing')}</p>
                )}
              </section>

              <div>
                <SNButton variant="link" aria-expanded={showRaw} onClick={() => setShowRaw((v) => !v)}>
                  {t('consent.technical')}
                </SNButton>
                {showRaw ? (
                  <ul className="mt-1.5 space-y-0.5 font-mono text-[12px] text-text-tertiary">
                    {[...readScopes, ...writeScopes].map((s) => (
                      <li key={s.key} className="break-all">
                        {s.key}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <section aria-labelledby="consent-who" className="space-y-2">
                <h3 id="consent-who" className="text-[13px] font-semibold text-text">
                  {t('consent.who_gets_access')}
                </h3>
                {scope === 'user' ? (
                  <p className="text-sm text-text-secondary">{t('consent.personal_note')}</p>
                ) : named.length > 0 ? (
                  <ul className="space-y-2">
                    {named.map((s) => (
                      <li key={s.agent_slug} className="flex items-center gap-2 text-sm text-text">
                        <SNSpecialistTile agentSlug={s.agent_slug} name={s.display_name} size="sm" />
                        <span className="min-w-0 flex-1 truncate">{s.display_name}</span>
                        <span className="text-[12px] text-text-secondary">
                          {includeWrite ? t('access.sino_can_change') : t('access.sino_can_read')}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-text-secondary">{t('consent.none_use_it')}</p>
                )}
                {!includeWrite ? (
                  <p className="text-[13px] text-text-tertiary">{t('consent.changes_off_yet')}</p>
                ) : null}
              </section>

              <div className="flex items-start gap-2 text-[13px] text-text-secondary">
                <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-text-brand" />
                <div className="space-y-1">
                  <p>{t('consent.trust_password')}</p>
                  <p>{t('consent.trust_disconnect', { app: provider.name })}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-border bg-canvas-alt p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
              <SNButton variant="ghost" size="lg" onClick={() => handleOpenChange(false)}>
                {t('common.cancel')}
              </SNButton>
              <SNButton variant="primary" size="lg" loading={starting} aria-busy={starting} onClick={() => void start()}>
                {starting
                  ? t('consent.starting')
                  : isReconnect
                    ? t('consent.reconnect_cta', { app: short })
                    : t('consent.cta', { app: short })}
              </SNButton>
            </div>
          </>
        )}
      </div>
    </SNDrawer>
  );
}
