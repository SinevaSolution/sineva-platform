import { cn } from '@/client/components/ui/cn';
import { SNSinoFigure } from '@/client/components/ui/sn_sino_figure';
import { specialistAccent, specialistPose } from '@/client/components/ui/specialist_accent';

/**
 * Who an item is from: Sino in the pose of that specialist, on a tile in the
 * specialist's accent. A null slug is the team, which is Sino waving. The name
 * is always printed next to it, so the picture is decorative.
 */
export function InboxAvatar({ slug, size = 40, className }: { slug: string | null; size?: number; className?: string }) {
  const accent = specialistAccent(slug ?? '');
  return (
    <span
      aria-hidden="true"
      // The accent mechanism of the compro: the wrapper names the ramp and the
      // tile reads only --accent-tile. `brand` (the team) has no ramp.
      data-product-accent={accent === 'brand' ? undefined : accent}
      className={cn(
        'relative inline-flex shrink-0 items-end justify-center overflow-hidden rounded-sm',
        accent === 'brand' ? 'bg-surface-tint' : 'bg-(--accent-tile)',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <SNSinoFigure pose={specialistPose(slug ?? '')} size={size} />
    </span>
  );
}
