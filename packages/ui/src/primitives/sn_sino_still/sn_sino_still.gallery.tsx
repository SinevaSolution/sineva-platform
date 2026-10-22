import { SNSinoStill, type SNSinoStillPose } from './sn_sino_still';

const POSES: SNSinoStillPose[] = ['confused', 'thumbs-up', 'wave', 'relaxed'];

export function SNSinoStillGallery() {
  return (
    <section aria-labelledby="gallery-sn-sino-still" className="space-y-4">
      <h2 id="gallery-sn-sino-still" className="text-lg font-semibold text-text">
        SNSinoStill
      </h2>
      <div className="flex flex-wrap items-end gap-6">
        {POSES.map((pose) => (
          <figure key={pose} className="space-y-1 text-center">
            <SNSinoStill pose={pose} />
            <figcaption className="text-xs text-text-tertiary">{pose}</figcaption>
          </figure>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-6">
        <figure className="space-y-1 text-center">
          <SNSinoStill pose="wave" orbit />
          <figcaption className="text-xs text-text-tertiary">orbit</figcaption>
        </figure>
        <figure className="space-y-1 text-center">
          <SNSinoStill pose="wave" size={96} />
          <figcaption className="text-xs text-text-tertiary">96 px</figcaption>
        </figure>
        <figure className="space-y-1 text-center">
          <SNSinoStill pose="wave" size={48} />
          <figcaption className="text-xs text-text-tertiary">48 px</figcaption>
        </figure>
        <figure className="space-y-1 text-center">
          <SNSinoStill pose="confused" size={400} alt="Sino looks confused" />
          <figcaption className="text-xs text-text-tertiary">400 requested, clamped to 160, with alt</figcaption>
        </figure>
      </div>
    </section>
  );
}
