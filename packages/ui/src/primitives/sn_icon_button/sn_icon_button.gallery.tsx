import { SNTooltipProvider } from '../sn_tooltip/sn_tooltip';
import { SNIconButton, type SNIconButtonSize, type SNIconButtonVariant } from './sn_icon_button';

const VARIANTS: SNIconButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger'];
const SIZES: SNIconButtonSize[] = ['sm', 'md', 'lg'];

const Dot = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <circle cx="12" cy="12" r="5" />
  </svg>
);

export function SNIconButtonGallery() {
  return (
    <section aria-labelledby="gallery-sn-icon-button" className="space-y-4">
      <h2 id="gallery-sn-icon-button" className="text-lg font-semibold text-text">
        SNIconButton
      </h2>
      <SNTooltipProvider delayDuration={0}>
        {VARIANTS.map((variant) => (
          <div key={variant} className="flex flex-wrap items-center gap-3">
            <span className="w-20 text-xs text-text-tertiary">{variant}</span>
            {SIZES.map((size) => (
              <SNIconButton key={size} label={`${variant} ${size}`} variant={variant} size={size}>
                <Dot />
              </SNIconButton>
            ))}
            <SNIconButton label="Disabled" variant={variant} disabled>
              <Dot />
            </SNIconButton>
            <SNIconButton label="Pressed" variant={variant} pressed>
              <Dot />
            </SNIconButton>
          </div>
        ))}
      </SNTooltipProvider>
    </section>
  );
}
