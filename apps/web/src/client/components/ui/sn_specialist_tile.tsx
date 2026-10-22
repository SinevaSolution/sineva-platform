import { cn } from './cn';
import { specialistAccent } from './specialist_accent';

const SIZES = {
  xs: 'size-4 rounded-xs text-[9px]',
  sm: 'size-5 rounded-xs text-[10px]',
  md: 'size-8 rounded-sm text-xs',
  lg: 'size-10 rounded-sm text-sm',
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
  const accent = specialistAccent(agentSlug);
  return (
    <span
      aria-hidden="true"
      // The compro accent mechanism: the wrapper names the ramp, the tile
      // reads only --accent-tile and --accent-text. `brand` has no ramp (it
      // is the action color, which an accent must never be), so it uses the
      // neutral brand tint.
      data-product-accent={accent === 'brand' ? undefined : accent}
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-semibold',
        accent === 'brand'
          ? 'bg-surface-tint text-text-brand'
          : 'bg-(--accent-tile) text-(--accent-text)',
        SIZES[size],
        className,
      )}
    >
      {initial}
    </span>
  );
}
