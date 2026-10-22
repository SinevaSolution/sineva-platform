import { SNStatusChip, type SNStatusChipTone } from './sn_status_chip';

const TONES: SNStatusChipTone[] = ['success', 'warning', 'danger', 'neutral', 'info'];

export function SNStatusChipGallery() {
  return (
    <section aria-labelledby="gallery-sn-status-chip" className="space-y-4">
      <h2 id="gallery-sn-status-chip" className="text-lg font-semibold text-text">
        SNStatusChip
      </h2>
      <div className="flex flex-wrap items-center gap-4">
        {TONES.map((tone) => (
          <SNStatusChip key={tone} tone={tone} label={tone} />
        ))}
      </div>
    </section>
  );
}
