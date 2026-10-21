import { cn } from './cn';
import { specialistAccent } from './specialist_accent';

const ACCENT_BG: Record<ReturnType<typeof specialistAccent>, string> = {
  people: 'bg-[var(--accent-people)]',
  finance: 'bg-[var(--accent-finance)]',
  sales: 'bg-[var(--accent-sales)]',
  social: 'bg-[var(--accent-social)]',
  help: 'bg-[var(--accent-help)]',
  insights: 'bg-[var(--accent-insights)]',
  brand: 'bg-[var(--accent-brand)]',
};

const SIZES = {
  xs: 'size-4 rounded text-[9px]',
  sm: 'size-5 rounded-[5px] text-[10px]',
  md: 'size-8 rounded-lg text-xs',
  lg: 'size-10 rounded-[10px] text-sm',
};

/**
 * Accent tile with the specialist's initial. The accent is decorative; the
 * name next to it carries the meaning, so the tile is hidden from assistive
 * technology.
 */
export function SpecialistTile({
  agentSlug,
  name,
  size = 'sm',
  className,
}: {
  agentSlug: string;
  name: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const initial = name.replace(/^Sino/, '').charAt(0) || name.charAt(0);
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-semibold text-white',
        ACCENT_BG[specialistAccent(agentSlug)],
        SIZES[size],
        className,
      )}
    >
      {initial}
    </span>
  );
}
