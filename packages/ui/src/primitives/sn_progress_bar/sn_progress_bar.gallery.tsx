import { SNProgressBar } from './sn_progress_bar';

export function SNProgressBarGallery() {
  return (
    <section aria-labelledby="gallery-sn-progress-bar" className="max-w-md space-y-4">
      <h2 id="gallery-sn-progress-bar" className="text-lg font-semibold text-text">
        SNProgressBar
      </h2>
      {[0, 25, 60, 100].map((value) => (
        <div key={value} className="space-y-1">
          <span className="text-xs text-text-tertiary">{value}%</span>
          <SNProgressBar label={`Progress ${value}%`} value={value} />
        </div>
      ))}
      <div className="space-y-1">
        <span className="text-xs text-text-tertiary">indeterminate</span>
        <SNProgressBar label="Loading" />
      </div>
      <div className="space-y-1">
        <span className="text-xs text-text-tertiary">max 20, value 5</span>
        <SNProgressBar label="Steps" value={5} max={20} />
      </div>
    </section>
  );
}
