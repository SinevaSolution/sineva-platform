'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SNBanner, SNButton } from '@sineva/ui';
import { apiRequest } from '@/client/lib/api';
import { useApiErrorText } from '@/client/lib/use_api_error';
import { useTranslations } from '@/i18n/provider';
import type { InvitationPreviewView, OwnershipTransferPreviewView } from '@/shared/members_view';

export function LinkAcceptance({
  kind,
  token,
  preview,
}: {
  kind: 'invite' | 'ownership';
  token: string;
  preview: InvitationPreviewView | OwnershipTransferPreviewView;
}) {
  const t = useTranslations('members');
  const router = useRouter();
  const errorText = useApiErrorText();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const matches =
    'email_matches_session' in preview ? preview.email_matches_session : preview.is_target;
  const next = `/${kind === 'invite' ? 'invite' : 'ownership'}/${encodeURIComponent(token)}`;
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
      setError(errorText(err));
      setPending(false);
    }
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
        {kind === 'invite'
          ? t('join_description', { workspace: preview.workspace_name })
          : t('ownership_description', { workspace: preview.workspace_name })}
      </p>
      {preview.state !== 'pending' ? (
        <SNBanner tone="warning">{t('link_inactive')}</SNBanner>
      ) : matches === null ? (
        <div className="flex flex-wrap gap-3">
          <SNButton asChild variant="primary">
            <Link href={`/sign-in?next=${encodeURIComponent(next)}`}>{t('sign_in')}</Link>
          </SNButton>
          {kind === 'invite' ? (
            <SNButton asChild>
              <Link href={`/sign-up?next=${encodeURIComponent(next)}`}>{t('create_account')}</Link>
            </SNButton>
          ) : null}
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
          <SNButton variant="primary" loading={pending} onClick={accept}>
            {kind === 'invite' ? t('join') : t('accept_ownership')}
          </SNButton>
        </>
      )}
      {error ? <SNBanner tone="danger">{error}</SNBanner> : null}
    </div>
  );
}
