import Link from 'next/link';
import { buttonVariants } from '@/client/components/ui/button';
import { cn } from '@/client/components/ui/cn';
import { SinoFigure } from '@/client/components/ui/sino_figure';
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
  return (
    <>
      <PageHeader title={title} />
      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
        <SinoFigure pose="laptop" size={140} className="anim-float" />
        <p className="anim-rise mt-2 rounded-full bg-hover px-2.5 py-0.5 text-[11px] font-medium text-fg-secondary">
          Coming soon
        </p>
        <h2 className="anim-rise mt-3 text-xl font-semibold tracking-[-0.02em] text-fg [--d:60ms]">
          Sino is still building {title}
        </h2>
        <p className="anim-rise mt-1.5 max-w-[42ch] text-sm text-fg-secondary [--d:120ms]">{blurb}</p>
        <div className="anim-rise mt-6 flex flex-wrap justify-center gap-2 [--d:180ms]">
          {children}
          <Link href={`/w/${workspaceSlug}/new`} className={cn(buttonVariants({ variant: 'primary' }))}>
            Start a chat instead
          </Link>
        </div>
      </div>
    </>
  );
}
