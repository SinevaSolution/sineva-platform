import { SNButton } from '../sn_button/sn_button';
import { SNTooltip, SNTooltipProvider } from './sn_tooltip';

export function SNTooltipGallery() {
  return (
    <section aria-labelledby="gallery-sn-tooltip" className="space-y-4">
      <h2 id="gallery-sn-tooltip" className="text-lg font-semibold text-text">
        SNTooltip
      </h2>
      <SNTooltipProvider delayDuration={0}>
        <div className="flex flex-wrap gap-3">
          <SNTooltip label="Top (default)">
            <SNButton>Hover or focus me</SNButton>
          </SNTooltip>
          <SNTooltip label="Toggle sidebar" shortcut="[" side="bottom">
            <SNButton>With shortcut</SNButton>
          </SNTooltip>
        </div>
      </SNTooltipProvider>
    </section>
  );
}
