'use client';

import { Button } from '@/client/components/ui/button';
import { SinoFigure } from '@/client/components/ui/sino_figure';
import { useTranslations } from '@/i18n/provider';

export default function WorkspaceError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('errors');
  const tCommon = useTranslations('common');
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <SinoFigure pose="confused" size={120} />
      <h1 className="text-base font-semibold">{t('workspace_error.title')}</h1>
      <p className="max-w-sm text-sm text-text-secondary">{t('workspace_error.body')}</p>
      <Button onClick={reset}>{tCommon('try_again')}</Button>
    </div>
  );
}
