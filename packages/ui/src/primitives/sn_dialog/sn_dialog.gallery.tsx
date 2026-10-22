'use client';

import * as React from 'react';
import { SNButton } from '../sn_button/sn_button';
import { SNTooltipProvider } from '../sn_tooltip/sn_tooltip';
import { SNDialog } from './sn_dialog';

type Variant = 'sm' | 'md' | 'close' | null;

export function SNDialogGallery() {
  const [open, setOpen] = React.useState<Variant>(null);
  const close = () => setOpen(null);
  return (
    <section aria-labelledby="gallery-sn-dialog" className="space-y-4">
      <h2 id="gallery-sn-dialog" className="text-lg font-semibold text-text">
        SNDialog
      </h2>
      <SNTooltipProvider>
        <div className="flex flex-wrap gap-3">
          <SNButton onClick={() => setOpen('sm')}>Small</SNButton>
          <SNButton onClick={() => setOpen('md')}>Medium with footer</SNButton>
          <SNButton onClick={() => setOpen('close')}>With close button</SNButton>
        </div>
        <SNDialog open={open === 'sm'} onOpenChange={(next) => !next && close()} title="Small dialog" size="sm" description="max-w-sm, no close button.">
          <p className="text-sm text-text-secondary">Body content goes here.</p>
        </SNDialog>
        <SNDialog
          open={open === 'md'}
          onOpenChange={(next) => !next && close()}
          title="Medium dialog"
          description="Width comes from --width-dialog."
          footer={
            <>
              <SNButton size="sm" onClick={close}>
                Cancel
              </SNButton>
              <SNButton size="sm" variant="primary" onClick={close}>
                Save
              </SNButton>
            </>
          }
        >
          <p className="text-sm text-text-secondary">Footer is right-aligned.</p>
        </SNDialog>
        <SNDialog open={open === 'close'} onOpenChange={(next) => !next && close()} title="Closable dialog" closeLabel="Close dialog">
          <p className="text-sm text-text-secondary">The close button needs an SNTooltipProvider above.</p>
        </SNDialog>
      </SNTooltipProvider>
    </section>
  );
}
