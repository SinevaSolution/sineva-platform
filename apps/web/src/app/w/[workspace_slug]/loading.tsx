'use client';

import { useTranslations } from '@/i18n/provider';

export default function WorkspaceLoading() {
  const t = useTranslations('common');
  return (
    <div className="flex flex-1 items-center justify-center" aria-busy="true" aria-label={t('loading')}>
      <span className="size-5 animate-spin rounded-full border-2 border-border-strong border-t-[var(--color-action-primary)]" />
    </div>
  );
}
