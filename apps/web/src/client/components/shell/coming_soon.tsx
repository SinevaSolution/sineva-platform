'use client';

import { PresetEmptyState } from '@/client/components/ui/empty_state';
import { useTranslations } from '@/i18n/provider';
import { PageHeader } from './page_header';

/** Placeholder for a planned feature: says what it will do, offers a way on. */
export function ComingSoon({
  title,
  blurb,
  workspaceSlug,
  children,
}: {
  title: string;
  blurb: string;
  workspaceSlug: string;
  children?: React.ReactNode;
}) {
  const t = useTranslations('shell');
  return (
    <>
      <PageHeader title={title} />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 pb-16 text-center">
        <p className="rounded-full bg-(--state-hover) px-2.5 py-0.5 text-[11px] font-medium text-text-secondary">
          {t('coming_soon.badge')}
        </p>
        {/* The blurb says what this feature will do, so it replaces the
            preset's generic sentence. */}
        <PresetEmptyState
          preset="coming_soon"
          values={{ title }}
          description={blurb}
          actionHref={`/w/${workspaceSlug}/new`}
        />
        {children}
      </div>
    </>
  );
}
