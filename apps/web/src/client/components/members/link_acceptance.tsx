'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SNBanner, SNButton } from '@sineva/ui';
import { ReauthDialog } from '@/client/components/auth/reauth_dialog';
import { apiRequest } from '@/client/lib/api';
import { clearOAuthNoticeFromUrl, isFreshSessionRequired } from '@/client/lib/fresh_session';
import { useApiErrorText } from '@/client/lib/use_api_error';
import { useTranslations } from '@/i18n/provider';
import type { InvitationPreviewView, OwnershipTransferPreviewView } from '@/shared/members_view';
import type { ReauthMethods } from '@/shared/sign_in_methods_view';

const ROLE_KEYS = {
  admin: 'roles.admin',
  member: 'roles.member',
  viewer: 'roles.viewer',
} as const;

type Translate = ReturnType<typeof useTranslations>;

// One sentence per reason, so "used" and "cancelled" never read as "expired".
function inactiveText(
  preview: InvitationPreviewView | OwnershipTransferPreviewView,
  t: Translate,
): string {
  if ('role' in preview) {
    return preview.state === 'expired'
      ? t('invite_state.expired')
      : preview.state === 'used'
        ? t('invite_state.used')
        : t('invite_state.revoked');
  }
  return preview.state === 'expired'
    ? t('ownership_state.expired')
    : preview.state === 'used'
      ? t('ownership_state.used')
      : t('ownership_state.cancelled');
}

const NOTICE_KEYS = {
  mismatch: 'notice.mismatch',
  cancelled: 'notice.cancelled',
  failed: 'notice.failed',
  not_configured: 'notice.not_configured',
} as const;

export function LinkAcceptance({
  kind,
  token,
  preview,
  reauthMethods = { has_password: true, providers: [] },
  initialNotice,
}: {
  kind: 'invite' | 'ownership';
  token: string;
  preview: InvitationPreviewView | OwnershipTransferPreviewView;
  /** How this person can re-confirm; accepting ownership needs a fresh session. */
  reauthMethods?: ReauthMethods;
  /** One-shot `?oauth=` code after a provider round trip. */
  initialNotice?: string;
}) {
  const t = useTranslations('members');
  const tReauth = useTranslations('reauth');
  const [reauth, setReauth] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState(initialNotice === 'reauthenticated');
  const router = useRouter();
  const errorText = useApiErrorText();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(() =>
    initialNotice && initialNotice !== 'reauthenticated'
      ? tReauth(NOTICE_KEYS[initialNotice as keyof typeof NOTICE_KEYS] ?? NOTICE_KEYS.failed)
      : null,
  );
  const matches =
    'email_matches_session' in preview ? preview.email_matches_session : preview.is_target;
  const next = `/${kind === 'invite' ? 'invite' : 'ownership'}/${encodeURIComponent(token)}`;
  React.useEffect(() => {
    if (!initialNotice) return;
    clearOAuthNoticeFromUrl();
  }, [initialNotice]);

  async function accept() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await apiRequest<{ workspace: { workspace_slug: string } }>(
        `/api/v1/${kind === 'invite' ? 'invitations' : 'ownership-transfers'}/${encodeURIComponent(token)}/accept`,
        { method: 'POST' },
      );
      router.replace(`/w/${result.workspace.workspace_slug}`);
      router.refresh();
    } catch (err) {
      if (isFreshSessionRequired(err)) {
        // Taking over a workspace needs a recent sign-in; ask once, then let them press Accept again.
        setConfirmed(false);
        setReauth(true);
      } else setError(errorText(err));
      setPending(false);
    }
  }

  async function confirmWithPassword(password: string) {
    await apiRequest('/api/v1/auth/reauthenticate', { method: 'POST', body: { password } });
    setReauth(false);
    setConfirmed(true);
  }
  async function signOut() {
    setPending(true);
    try {
      await apiRequest('/api/v1/auth/sign-out', { method: 'POST' });
      router.replace(`/sign-in?next=${encodeURIComponent(next)}`);
      router.refresh();
    } catch (err) {
      setError(errorText(err));
      setPending(false);
    }
  }
  return (
    <div className="space-y-5">
      <p className="text-sm text-text-secondary">
        {'role' in preview
          ? t('join_description', {
              workspace: preview.workspace_name,
              role: t(ROLE_KEYS[preview.role]),
            })
          : t('ownership_description', { workspace: preview.workspace_name })}
      </p>
      {preview.state !== 'pending' ? (
        <>
          <SNBanner tone="warning">{inactiveText(preview, t)}</SNBanner>
          <SNButton asChild>
            <Link href="/">{t('go_home')}</Link>
          </SNButton>
        </>
      ) : matches === null ? (
        <div className="space-y-3">
          <p className="text-sm text-text-secondary">
            {kind === 'invite' ? t('signed_out_hint_invite') : t('signed_out_hint_ownership')}
          </p>
          <div className="flex flex-wrap gap-3">
            <SNButton asChild variant="primary">
              <Link href={`/sign-in?next=${encodeURIComponent(next)}`}>{t('sign_in')}</Link>
            </SNButton>
            {kind === 'invite' ? (
              <SNButton asChild>
                <Link href={`/sign-up?next=${encodeURIComponent(next)}`}>
                  {t('create_account')}
                </Link>
              </SNButton>
            ) : null}
          </div>
        </div>
      ) : matches === false ? (
        <>
          <SNBanner tone="warning">{t('wrong_account')}</SNBanner>
          <SNButton loading={pending} onClick={signOut}>
            {t('switch_account')}
          </SNButton>
        </>
      ) : (
        <>
          {kind === 'ownership' ? (
            <SNBanner tone="warning">{t('ownership_warning')}</SNBanner>
          ) : null}
          {confirmed ? <SNBanner tone="success">{t('reauth_done')}</SNBanner> : null}
          <SNButton variant="primary" loading={pending} onClick={accept}>
            {kind === 'invite' ? t('join') : t('accept_ownership')}
          </SNButton>
        </>
      )}
      {error ? <SNBanner tone="danger">{error}</SNBanner> : null}
      <ReauthDialog
        open={reauth}
        onOpenChange={setReauth}
        methods={reauthMethods}
        onPassword={confirmWithPassword}
        onOAuthStart={() => undefined}
      />
    </div>
  );
}
