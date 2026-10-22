import { Star } from 'lucide-react';
import { SNBadge, type SNBadgeTone } from './sn_badge';

const TONES: SNBadgeTone[] = [
  'neutral',
  'brand',
  'success',
  'warning',
  'danger',
  'review',
  'running',
  'paused',
  'failed',
];

export function SNBadgeGallery() {
  return (
    <section aria-labelledby="gallery-sn-badge" className="space-y-4">
      <h2 id="gallery-sn-badge" className="text-lg font-semibold text-text">
        SNBadge
      </h2>
      <div className="flex flex-wrap items-center gap-3">
        {TONES.map((tone) => (
          <SNBadge key={tone} tone={tone}>
            {tone}
          </SNBadge>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-text-tertiary">icon override</span>
        <SNBadge tone="review" icon={<Star />}>
          In review
        </SNBadge>
        <SNBadge tone="brand" icon={<Star />}>
          Featured
        </SNBadge>
      </div>
    </section>
  );
}
