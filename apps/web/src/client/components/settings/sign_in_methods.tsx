'use client';

import { Mail } from 'lucide-react';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { GitHubMark, GoogleMark } from '@/client/components/auth/oauth_buttons';
import { ReauthDialog } from '@/client/components/auth/reauth_dialog';
import { PresetEmptyState } from '@/client/components/ui/empty_state';
import { apiRequest } from '@/client/lib/api';
import {
  clearOAuthNoticeFromUrl,
  isFreshSessionRequired,
  savePendingReauth,
  takePendingReauth,
  type PendingReauth,
} from '@/client/lib/fresh_session';
import { useApiErrorText } from '@/client/lib/use_api_error';
import { useTranslations } from '@/i18n/provider';
import {
  reauthMethodsOf,
  type LinkedAccountView,
  type OAuthProviderId,
  type SignInMethodsView,
} from '@/shared/sign_in_methods_view';
import { SNBanner, SNButton, SNConfirmDialog, SNPill, SNTooltip, snToast } from '@sineva/ui';
import { SettingsRow, SettingsSection } from './settings_layout';

export type { LinkedAccountView };

const NOTICE_KEYS = {
  account_in_use: 'sign_in.notice.account_in_use',
  provider_already_linked: 'sign_in.notice.provider_already_linked',
  fresh_required: 'sign_in.notice.fresh_required',
  not_configured: 'sign_in.notice.not_configured',
  mismatch: 'sign_in.notice.mismatch',
  cancelled: 'sign_in.notice.cancelled',
  failed: 'sign_in.notice.failed',
} as const;

function Mark({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-9 shrink-0 items-center justify-center rounded-sm border border-border bg-surface [&_svg]:size-[18px]"
    >
      {children}
    </span>
  );
}

const linkHref = (provider: OAuthProviderId, returnTo: string) =>
  `/api/v1/auth/oauth/${provider}?intent=link&return_to=${encodeURIComponent(returnTo)}`;

/**
 * How this person signs in: connect or disconnect Google and GitHub, and add a
 * password when the account has none. Every change that the server guards with
 * a fresh session goes through the same "Confirm it's you" dialog the members
 * page uses.
 */
export function SignInMethods({
  view,
  workspaceSlug,
  initialNotice,
}: {
  view: SignInMethodsView;
  /** Where link and re-confirm round trips come back to. */
  workspaceSlug: string;
  /** One-shot `?oauth=` code the page was opened with after a provider round trip. */
  initialNotice?: string;
}) {
  const t = useTranslations('account');
  const errorText = useApiErrorText();
  const router = useRouter();
  const { accounts, configured } = view;
  const byProvider = new Map(accounts.map((a) => [a.provider, a]));
  const hasPassword = byProvider.has('credential');
  // Disconnecting the only sign-in method would lock the person out; the server
  // refuses it too, this just says so before they try.
  const onlyMethod = accounts.length <= 1;
  // Coming back from a provider re-confirm means the session is fresh again.
  const [fresh, setFresh] = React.useState(view.fresh || initialNotice === 'reauthenticated');
  const [error, setError] = React.useState<string | null>(() =>
    initialNotice && initialNotice !== 'linked' && initialNotice !== 'reauthenticated'
      ? t(NOTICE_KEYS[initialNotice as keyof typeof NOTICE_KEYS] ?? NOTICE_KEYS.failed)
      : null,
  );
  const [pending, setPending] = React.useState(false);
  const [disconnecting, setDisconnecting] = React.useState<OAuthProviderId | null>(null);
  const [reauth, setReauth] = React.useState(false);
  const waiting = React.useRef<{ action: () => Promise<void>; resume: PendingReauth } | null>(null);
  const returnTo = `/w/${workspaceSlug}/settings/profile?tab=sign_in`;

  const providerName = (provider: OAuthProviderId) =>
    provider === 'google' ? t('sign_in.google') : t('sign_in.github');

  function detail(provider: LinkedAccountView | undefined): string {
    if (!provider) return t('sign_in.not_linked_helper');
    return provider.provider_email ?? provider.provider_username ?? t('sign_in.linked_helper');
  }

  /** Runs a guarded action; a stale session opens the re-confirm dialog and retries after it. */
  async function guarded(action: () => Promise<void>, resume: PendingReauth) {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      if (isFreshSessionRequired(err)) {
        waiting.current = { action, resume };
        setFresh(false);
        setDisconnecting(null);
        setReauth(true);
      } else {
        setError(errorText(err));
        setDisconnecting(null);
      }
    } finally {
      setPending(false);
    }
  }

  const unlink = (provider: OAuthProviderId) => async () => {
    await apiRequest(`/api/v1/me/accounts/${provider}`, { method: 'DELETE' });
    setDisconnecting(null);
    snToast.success(t('sign_in.disconnected', { provider: providerName(provider) }));
    router.refresh();
  };

  function connect(event: React.MouseEvent, provider: OAuthProviderId) {
    if (fresh) return; // The plain link goes straight to the provider.
    event.preventDefault();
    waiting.current = {
      action: async () => window.location.assign(linkHref(provider, returnTo)),
      resume: { kind: 'link_provider', provider },
    };
    setReauth(true);
  }

  async function confirmWithPassword(password: string) {
    await apiRequest('/api/v1/auth/reauthenticate', { method: 'POST', body: { password } });
    setFresh(true);
    setReauth(false);
    const next = waiting.current;
    waiting.current = null;
    if (next) await guarded(next.action, next.resume);
  }

  async function sendPasswordLink() {
    setPending(true);
    setError(null);
    try {
      // The reset email is the safe way to add a first password: it proves the
      // mailbox, and it needs no password the account does not have yet.
      await apiRequest('/api/v1/auth/request-password-reset', {
        method: 'POST',
        body: { email: view.email },
      });
      snToast.success(t('sign_in.set_password_sent', { email: view.email }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  // Back from a provider: finish the waiting action or confirm the link.
  React.useEffect(() => {
    if (!initialNotice) return;
    clearOAuthNoticeFromUrl();
    const saved = takePendingReauth();
    if (initialNotice === 'linked') {
      snToast.success(t('sign_in.notice.linked'));
    } else if (initialNotice === 'reauthenticated') {
      if (saved?.kind === 'unlink_provider') {
        const provider = saved.provider as OAuthProviderId;
        // A microtask: the action sets state, which an effect body must not do synchronously.
        queueMicrotask(() => void guarded(unlink(provider), saved));
      } else if (saved?.kind === 'link_provider') {
        window.location.assign(linkHref(saved.provider as OAuthProviderId, returnTo));
      }
    }
    // The effect is the one-shot reaction to the page load; it must not re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function providerRow(provider: OAuthProviderId) {
    const linked = byProvider.get(provider);
    const name = providerName(provider);
    const isConfigured = configured.includes(provider);
    return (
      <SettingsRow inline label={name} helper={detail(linked)}>
        <span className="flex flex-wrap items-center justify-end gap-3">
          <Mark>{provider === 'google' ? <GoogleMark /> : <GitHubMark />}</Mark>
          <SNPill tone={linked ? 'positive' : 'neutral'}>
            {linked ? t('profile.linked') : t('profile.not_linked')}
          </SNPill>
          {linked ? (
            onlyMethod ? (
              <SNTooltip label={t('sign_in.disconnect_blocked')}>
                {/* A disabled button swallows pointer and focus events; the wrapper keeps the tooltip reachable. */}
                <span tabIndex={0} className="inline-flex">
                  <SNButton size="sm" variant="ghost" disabled>
                    {t('sign_in.disconnect')}
                  </SNButton>
                </span>
              </SNTooltip>
            ) : (
              <SNButton
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => setDisconnecting(provider)}
              >
                {t('sign_in.disconnect')}
              </SNButton>
            )
          ) : isConfigured ? (
            <SNButton asChild size="sm" variant="secondary">
              <a href={linkHref(provider, returnTo)} onClick={(e) => connect(e, provider)}>
                {provider === 'google' ? t('sign_in.connect_google') : t('sign_in.connect_github')}
              </a>
            </SNButton>
          ) : (
            <SNTooltip label={t('sign_in.not_configured', { provider: name })}>
              <span tabIndex={0} className="inline-flex">
                <SNButton size="sm" variant="secondary" disabled>
                  {provider === 'google'
                    ? t('sign_in.connect_google')
                    : t('sign_in.connect_github')}
                </SNButton>
              </span>
            </SNTooltip>
          )}
        </span>
      </SettingsRow>
    );
  }

  return (
    <div className="space-y-9">
      {error ? (
        <SNBanner
          tone="danger"
          onDismiss={() => setError(null)}
          dismissLabel={t('sign_in.dismiss')}
        >
          {error}
        </SNBanner>
      ) : null}
      <SettingsSection title={t('sign_in.section_methods')}>
        {providerRow('google')}
        {providerRow('github')}
        <SettingsRow
          inline
          label={t('sign_in.password')}
          helper={hasPassword ? view.email : t('sign_in.set_password_helper')}
        >
          <span className="flex flex-wrap items-center justify-end gap-3">
            <Mark>
              <Mail className="text-text-secondary" />
            </Mark>
            <SNPill tone={hasPassword ? 'positive' : 'neutral'}>
              {hasPassword ? t('sign_in.password_set') : t('sign_in.password_not_set')}
            </SNPill>
            {hasPassword ? null : (
              <SNButton size="sm" variant="secondary" loading={pending} onClick={sendPasswordLink}>
                {t('sign_in.set_password')}
              </SNButton>
            )}
          </span>
        </SettingsRow>
        {!byProvider.has('google') && !byProvider.has('github') ? (
          <PresetEmptyState preset="sign_in_methods_none" className="py-4" />
        ) : null}
      </SettingsSection>
      <SNConfirmDialog
        open={disconnecting !== null}
        onOpenChange={(open) => {
          if (!open) setDisconnecting(null);
        }}
        title={t('sign_in.disconnect_title', {
          provider: disconnecting ? providerName(disconnecting) : '',
        })}
        description={t('sign_in.disconnect_body', {
          provider: disconnecting ? providerName(disconnecting) : '',
        })}
        confirmLabel={t('sign_in.disconnect')}
        cancelLabel={t('sign_in.cancel')}
        destructive
        pending={pending}
        onConfirm={() => {
          if (disconnecting) {
            void guarded(unlink(disconnecting), {
              kind: 'unlink_provider',
              provider: disconnecting,
            });
          }
        }}
      />
      <ReauthDialog
        open={reauth}
        onOpenChange={(open) => {
          setReauth(open);
          if (!open) waiting.current = null;
        }}
        methods={reauthMethodsOf(view)}
        onPassword={confirmWithPassword}
        onOAuthStart={() => {
          if (waiting.current) savePendingReauth(waiting.current.resume);
        }}
      />
    </div>
  );
}
