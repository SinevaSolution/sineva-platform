'use client';

import { Button } from '@/client/components/ui/button';
import { useTranslations } from '@/i18n/provider';

/**
 * Appears at the bottom of the content column as soon as the form differs from
 * what is saved, so there is one obvious place to commit or back out. It is
 * sticky inside the scrolling column, so it never covers the last row.
 */
export function SaveBar({
  visible,
  pending,
  canSave,
  onSave,
  onDiscard,
}: {
  visible: boolean;
  pending: boolean;
  canSave: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const t = useTranslations('account');
  if (!visible) return null;
  return (
    <div className="anim-rise sticky bottom-4 z-(--z-sticky) mt-8" role="region" aria-label={t('save_bar.label')}>
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface px-4 py-3 shadow-md">
        <p className="min-w-0 flex-1 text-[13px] font-medium text-text" aria-live="polite">
          {t('save_bar.unsaved')}
        </p>
        <Button variant="ghost" size="md" onClick={onDiscard} disabled={pending}>
          {t('save_bar.discard')}
        </Button>
        <Button variant="primary" size="md" onClick={onSave} disabled={!canSave || pending}>
          {pending ? t('save_bar.saving') : t('save_bar.save')}
        </Button>
      </div>
    </div>
  );
}
