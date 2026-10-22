'use client';

import { Search } from 'lucide-react';
import { SNTooltipProvider } from '../sn_tooltip/sn_tooltip';
import { SNInput } from './sn_input';

export function SNInputGallery() {
  return (
    <section aria-labelledby="gallery-sn-input" className="max-w-sm space-y-3">
      <h2 id="gallery-sn-input" className="text-lg font-semibold text-text">
        SNInput
      </h2>
      <SNTooltipProvider delayDuration={0}>
        <SNInput aria-label="Default" placeholder="Default" />
        <SNInput aria-label="Filled" defaultValue="Filled value" />
        <SNInput aria-label="Invalid" aria-invalid defaultValue="Invalid value" />
        <SNInput aria-label="Read only" readOnly defaultValue="Read only" />
        <SNInput aria-label="Disabled" disabled defaultValue="Disabled" />
        <SNInput aria-label="Search" placeholder="Search" startAdornment={<Search />} />
        <SNInput aria-label="Password" type="password" defaultValue="secret" showLabel="Show password" hideLabel="Hide password" />
      </SNTooltipProvider>
    </section>
  );
}
