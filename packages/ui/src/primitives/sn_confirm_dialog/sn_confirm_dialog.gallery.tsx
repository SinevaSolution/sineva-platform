'use client';

import * as React from 'react';
import { SNButton } from '../sn_button/sn_button';
import { SNConfirmDialog } from './sn_confirm_dialog';

export function SNConfirmDialogGallery() {
  const [open, setOpen] = React.useState<'plain' | 'destructive' | null>(null);
  const [pending, setPending] = React.useState(false);

  // Simulates a request: pending blocks Escape and cancel, then the dialog closes.
  function confirm() {
    setPending(true);
    window.setTimeout(() => {
      setPending(false);
      setOpen(null);
    }, 1500);
  }

  return (
    <section aria-labelledby="gallery-sn-confirm-dialog" className="space-y-4">
      <h2 id="gallery-sn-confirm-dialog" className="text-lg font-semibold text-text">
        SNConfirmDialog
      </h2>
      <div className="flex flex-wrap gap-3">
        <SNButton onClick={() => setOpen('plain')}>Confirm</SNButton>
        <SNButton variant="danger" onClick={() => setOpen('destructive')}>
          Destructive with pending
        </SNButton>
      </div>
      <SNConfirmDialog
        open={open === 'plain'}
        onOpenChange={(next) => !next && setOpen(null)}
        title="Publish this page?"
        description="Everyone in the workspace will see it."
        confirmLabel="Publish"
        cancelLabel="Cancel"
        onConfirm={() => setOpen(null)}
      />
      <SNConfirmDialog
        open={open === 'destructive'}
        onOpenChange={(next) => !next && setOpen(null)}
        title="Delete this chat?"
        description="This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        pendingLabel="Deleting..."
        destructive
        pending={pending}
        onConfirm={confirm}
      />
    </section>
  );
}
