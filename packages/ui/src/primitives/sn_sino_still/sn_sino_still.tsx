import { cx } from '../../lib/cx';

export type SNSinoStillPose = 'confused' | 'thumbs-up' | 'wave' | 'relaxed';

// A still, not the living loop: it is small state art, never a hero. 160 px is
// the ceiling so a state view cannot turn into a poster.
const MAX_SIZE = 160;

export interface SNSinoStillProps {
  pose: SNSinoStillPose;
  /** Pixels; clamped to 160. */
  size?: number;
  /** Decorative (`alt=""`) unless the pose carries meaning. */
  alt?: string;
  /** Thin ring behind Sino, as on the compro stage. */
  orbit?: boolean;
  className?: string;
}

/**
 * Sino poster on the compro stage (same as `SinoFigure` in the app): AVIF with
 * a WebP fallback over a soft teal glow. Sino is pale teal and disappears on
 * white without the glow.
 */
export function SNSinoStill({ pose, size = MAX_SIZE, alt = '', orbit = false, className }: SNSinoStillProps) {
  const px = Math.min(MAX_SIZE, Math.max(1, size));
  const base = `/mascot/v011/sino-${pose}`;
  return (
    <span
      className={cx('relative inline-flex shrink-0 items-end justify-center', className)}
      style={{ width: px, height: px }}
    >
      <span
        aria-hidden="true"
        data-part="glow"
        className="absolute inset-x-[12%] bottom-[6%] top-[22%] rounded-full bg-(image:--gradient-glow-teal)"
      />
      {orbit ? (
        <span
          aria-hidden="true"
          data-part="orbit"
          className="absolute inset-[6%] rounded-full border border-dashed border-border-strong"
        />
      ) : null}
      <span
        aria-hidden="true"
        data-part="shadow"
        className="absolute inset-x-[28%] bottom-[3%] h-[5%] rounded-full bg-text/15 blur-[3px]"
      />
      <picture className="relative">
        <source srcSet={`${base}.avif`} type="image/avif" />
        <img
          src={`${base}.webp`}
          alt={alt}
          width={px}
          height={px}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="select-none object-contain"
          style={{ width: px, height: px }}
        />
      </picture>
    </span>
  );
}
