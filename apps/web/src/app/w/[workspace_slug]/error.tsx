'use client';

import { SNSinoFigure } from '@/client/components/ui/sn_sino_figure';
import { useTranslations } from '@/i18n/provider';
import { SNButton } from '@sineva/ui';

export default function WorkspaceError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('errors');
  const tCommon = useTranslations('common');
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <SNSinoFigure pose="confused" size={120} />
      <h1 className="text-base font-semibold">{t('workspace_error.title')}</h1>
      <p className="max-w-sm text-sm text-text-secondary">{t('workspace_error.body')}</p>
      <SNButton size="sm" onClick={reset}>
        {tCommon('try_again')}
      </SNButton>
    </div>
  );
}
