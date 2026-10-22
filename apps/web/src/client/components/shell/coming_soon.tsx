'use client';

import Link from 'next/link';
import { buttonVariants } from '@/client/components/ui/button';
import { cn } from '@/client/components/ui/cn';
import { SinoFigure } from '@/client/components/ui/sino_figure';
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
      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
        <SinoFigure pose="laptop" size={140} className="anim-float" />
        <p className="anim-rise mt-2 rounded-full bg-(--state-hover) px-2.5 py-0.5 text-[11px] font-medium text-text-secondary">
          {t('coming_soon.badge')}
        </p>
        <h2 className="anim-rise mt-3 text-xl font-semibold tracking-[-0.02em] text-text [--d:60ms]">
          {t('coming_soon.heading', { title })}
        </h2>
        <p className="anim-rise mt-1.5 max-w-[42ch] text-sm text-text-secondary [--d:120ms]">{blurb}</p>
        <div className="anim-rise mt-6 flex flex-wrap justify-center gap-2 [--d:180ms]">
          {children}
          <Link href={`/w/${workspaceSlug}/new`} className={cn(buttonVariants({ variant: 'primary' }))}>
            {t('coming_soon.cta')}
          </Link>
        </div>
      </div>
    </>
  );
}
