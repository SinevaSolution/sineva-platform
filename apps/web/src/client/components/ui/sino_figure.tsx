import { cn } from './cn';
import type { SinoPose } from './specialist_accent';

/**
 * Sino still (compro v011 poses), AVIF with WebP fallback, on the soft teal
 * stage glow: Sino is pale teal and disappears on white without it.
 * Decorative by default (`alt=""`); pass `alt` when the pose carries meaning.
 */
export function SinoFigure({
  pose,
  size,
  alt = '',
  priority = false,
  className,
}: {
  pose: SinoPose;
  size: number;
  alt?: string;
  priority?: boolean;
  className?: string;
}) {
  const base = `/mascot/v011/sino-${pose}`;
  return (
    <span
      className={cn('relative inline-flex shrink-0 items-end justify-center', className)}
      style={{ width: size, height: size }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-[12%] bottom-[6%] top-[22%] rounded-full bg-(image:--gradient-glow-teal)"
      />
      <picture className="relative">
        <source srcSet={`${base}.avif`} type="image/avif" />
        <img
          src={`${base}.webp`}
          alt={alt}
          width={size}
          height={size}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          className="select-none object-contain"
          style={{ width: size, height: size }}
        />
      </picture>
    </span>
  );
}
