'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { SNBanner, SNButton } from '@sineva/ui';
import { ApiError, apiRequest } from '@/client/lib/api';
import { useApiErrorText } from '@/client/lib/use_api_error';
import { useTranslations } from '@/i18n/provider';
export function FirstWorkspace() {
  const t = useTranslations('onboarding_ui');
  const router = useRouter();
  const errorText = useApiErrorText();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  async function create() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await apiRequest<{ workspace: { workspace_slug: string } }>(
        '/api/v1/me/first-workspace',
        { method: 'POST' },
      );
      router.replace(`/w/${result.workspace.workspace_slug}/onboarding`);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.detailCodes.includes('already_has_workspace')) {
        router.replace('/');
        router.refresh();
      } else
        setError(
          err instanceof ApiError && err.detailCodes.includes('invited_user')
            ? t('pending_invitation')
            : errorText(err),
        );
      setPending(false);
    }
  }
  return (
    <div className="space-y-5">
      <p className="text-sm text-text-secondary">{t('create_description')}</p>
      {error ? <SNBanner tone="danger">{error}</SNBanner> : null}
      <SNButton variant="primary" loading={pending} onClick={create}>
        {t('create_workspace')}
      </SNButton>
    </div>
  );
}
