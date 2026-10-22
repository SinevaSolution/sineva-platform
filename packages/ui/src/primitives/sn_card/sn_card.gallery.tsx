import { SNCard, type SNCardPadding } from './sn_card';

const PADDINGS: SNCardPadding[] = ['none', 'sm', 'md', 'lg'];

export function SNCardGallery() {
  return (
    <section aria-labelledby="gallery-sn-card" className="space-y-4">
      <h2 id="gallery-sn-card" className="text-lg font-semibold text-text">
        SNCard
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PADDINGS.map((padding) => (
          <SNCard key={padding} padding={padding}>
            <p className="text-sm text-text">padding {padding}</p>
          </SNCard>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <SNCard>
          <p className="text-sm text-text">Flat</p>
        </SNCard>
        <SNCard elevated>
          <p className="text-sm text-text">Elevated</p>
        </SNCard>
        <SNCard interactive tabIndex={0}>
          <p className="text-sm text-text">Interactive (hover, focus)</p>
        </SNCard>
        <SNCard interactive asChild elevated>
          <a href="#gallery-sn-card">
            <p className="text-sm text-text">Interactive link, elevated</p>
          </a>
        </SNCard>
        <SNCard interactive asChild>
          <button type="button" className="text-start">
            <p className="text-sm text-text">Interactive button</p>
          </button>
        </SNCard>
      </div>
    </section>
  );
}
