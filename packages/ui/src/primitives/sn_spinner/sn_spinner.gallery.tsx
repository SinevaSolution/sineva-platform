import { SNSpinner } from './sn_spinner';

export function SNSpinnerGallery() {
  return (
    <section aria-labelledby="gallery-sn-spinner" className="space-y-4">
      <h2 id="gallery-sn-spinner" className="text-lg font-semibold text-text">
        SNSpinner
      </h2>
      <div className="flex items-center gap-4 text-text-brand">
        <SNSpinner size="sm" />
        <SNSpinner size="md" />
        <SNSpinner size="lg" label="Loading" />
      </div>
    </section>
  );
}
