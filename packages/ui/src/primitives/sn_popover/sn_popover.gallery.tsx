import { SNButton } from '../sn_button/sn_button';
import { SNPopover, SNPopoverContent, SNPopoverTrigger } from './sn_popover';

export function SNPopoverGallery() {
  return (
    <section aria-labelledby="gallery-sn-popover" className="space-y-4">
      <h2 id="gallery-sn-popover" className="text-lg font-semibold text-text">
        SNPopover
      </h2>
      <div className="flex flex-wrap gap-3">
        <SNPopover>
          <SNPopoverTrigger asChild>
            <SNButton>Bottom, start-aligned</SNButton>
          </SNPopoverTrigger>
          <SNPopoverContent side="bottom" align="start" className="w-64">
            <p className="p-2 text-sm text-text-secondary">Free-form content. Escape or a press outside closes it.</p>
          </SNPopoverContent>
        </SNPopover>
        <SNPopover>
          <SNPopoverTrigger asChild>
            <SNButton variant="ghost">Top, end-aligned</SNButton>
          </SNPopoverTrigger>
          <SNPopoverContent side="top" align="end" className="w-48">
            <p className="p-2 text-sm text-text-secondary">Flips when there is no room.</p>
          </SNPopoverContent>
        </SNPopover>
      </div>
    </section>
  );
}
