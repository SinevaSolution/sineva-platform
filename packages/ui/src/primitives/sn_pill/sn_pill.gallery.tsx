import { SNPill, type SNPillTone } from './sn_pill';

const TONES: SNPillTone[] = ['positive', 'neutral', 'brand'];

export function SNPillGallery() {
  return (
    <section aria-labelledby="gallery-sn-pill" className="space-y-4">
      <h2 id="gallery-sn-pill" className="text-lg font-semibold text-text">
        SNPill
      </h2>
      <div className="flex flex-wrap items-center gap-3">
        {TONES.map((tone) => (
          <SNPill key={tone} tone={tone}>
            {tone}
          </SNPill>
        ))}
      </div>
    </section>
  );
}
