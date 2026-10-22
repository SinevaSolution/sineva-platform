import { SNButton, type SNButtonSize, type SNButtonVariant } from './sn_button';

const VARIANTS: SNButtonVariant[] = ['primary', 'dark', 'secondary', 'ghost', 'danger', 'link'];
const SIZES: SNButtonSize[] = ['xs', 'sm', 'md', 'lg'];

// Every state of SNButton for /dev/ui. Forced hover and focus are applied by
// the gallery shell (data attributes), not here.
export function SNButtonGallery() {
  return (
    <section aria-labelledby="gallery-sn-button" className="space-y-4">
      <h2 id="gallery-sn-button" className="text-lg font-semibold text-text">
        SNButton
      </h2>
      {VARIANTS.map((variant) => (
        <div key={variant} className="flex flex-wrap items-center gap-3">
          <span className="w-20 text-xs text-text-tertiary">{variant}</span>
          {SIZES.map((size) => (
            <SNButton key={size} variant={variant} size={size}>
              {size}
            </SNButton>
          ))}
          <SNButton variant={variant} disabled>
            Disabled
          </SNButton>
          <SNButton variant={variant} loading>
            Loading
          </SNButton>
          <SNButton variant={variant} shape="pill">
            Pill
          </SNButton>
        </div>
      ))}
    </section>
  );
}
