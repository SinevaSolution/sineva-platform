import { SNButton } from '../sn_button/sn_button';
import { SNBanner, type SNBannerTone } from './sn_banner';

const TONES: SNBannerTone[] = ['info', 'success', 'warning', 'danger'];

export function SNBannerGallery() {
  return (
    <section aria-labelledby="gallery-sn-banner" className="max-w-xl space-y-3">
      <h2 id="gallery-sn-banner" className="text-lg font-semibold text-text">
        SNBanner
      </h2>
      {TONES.map((tone) => (
        <SNBanner key={tone} tone={tone}>
          A {tone} message that explains what happened.
        </SNBanner>
      ))}
      <SNBanner tone="warning" title="Heads up">
        With a title and a body.
      </SNBanner>
      <SNBanner
        tone="danger"
        title="Could not save"
        action={
          <SNButton variant="link" size="xs">
            Retry
          </SNButton>
        }
      >
        With an action.
      </SNBanner>
      <SNBanner tone="info" onDismiss={() => {}} dismissLabel="Dismiss">
        Dismissible.
      </SNBanner>
      <SNBanner
        tone="success"
        title="Saved"
        action={
          <SNButton variant="link" size="xs">
            Undo
          </SNButton>
        }
        onDismiss={() => {}}
        dismissLabel="Dismiss"
      >
        Everything at once.
      </SNBanner>
    </section>
  );
}
