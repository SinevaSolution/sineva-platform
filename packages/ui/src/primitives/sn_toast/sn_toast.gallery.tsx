'use client';

import { SNButton } from '../sn_button/sn_button';
import { SNToaster, snToast } from './sn_toast';

export function SNToastGallery() {
  return (
    <section aria-labelledby="gallery-sn-toast" className="space-y-4">
      <h2 id="gallery-sn-toast" className="text-lg font-semibold text-text">
        SNToast
      </h2>
      {/* The gallery shell may already mount one SNToaster; two would show every toast twice. */}
      <SNToaster closeLabel="Dismiss notification" />
      <div className="flex flex-wrap gap-3">
        <SNButton onClick={() => snToast.success('Saved')}>Success</SNButton>
        <SNButton onClick={() => snToast.error('Could not save')}>Error</SNButton>
        <SNButton onClick={() => snToast.info('Heads up')}>Info</SNButton>
        <SNButton onClick={() => snToast.warning('Careful')}>Warning</SNButton>
        <SNButton onClick={() => snToast.message('Plain message')}>Message</SNButton>
        <SNButton
          onClick={() => snToast.error('Upload failed', { action: { label: 'Retry', onClick: () => snToast.success('Retrying') } })}
        >
          With action
        </SNButton>
        <SNButton variant="ghost" onClick={() => snToast.dismiss()}>
          Dismiss all
        </SNButton>
      </div>
    </section>
  );
}
