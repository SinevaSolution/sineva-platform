'use client';

import * as React from 'react';
import { SNButton } from '../sn_button/sn_button';
import { SNTooltipProvider } from '../sn_tooltip/sn_tooltip';
import { SNDrawer, type SNDrawerProps } from './sn_drawer';

type Variant = { label: string; props: Partial<SNDrawerProps> };

const VARIANTS: Variant[] = [
  { label: 'Start, nav width (bottom sheet below 768 px)', props: {} },
  { label: 'End, panel width', props: { side: 'end', width: 'panel', showTitle: true } },
  { label: 'Side sheet at every width', props: { mobile: 'side' } },
];

export function SNDrawerGallery() {
  const [open, setOpen] = React.useState<number | null>(null);
  return (
    <section aria-labelledby="gallery-sn-drawer" className="space-y-4">
      <h2 id="gallery-sn-drawer" className="text-lg font-semibold text-text">
        SNDrawer
      </h2>
      <SNTooltipProvider>
        <div className="flex flex-wrap gap-3">
          {VARIANTS.map((variant, index) => (
            <SNButton key={variant.label} onClick={() => setOpen(index)}>
              {variant.label}
            </SNButton>
          ))}
        </div>
        {VARIANTS.map((variant, index) => (
          <SNDrawer
            key={variant.label}
            open={open === index}
            onOpenChange={(next) => !next && setOpen(null)}
            title="Drawer"
            closeLabel="Close drawer"
            {...variant.props}
          >
            <p className="p-4 pt-14 text-sm text-text-secondary">{variant.label}</p>
          </SNDrawer>
        ))}
      </SNTooltipProvider>
    </section>
  );
}
