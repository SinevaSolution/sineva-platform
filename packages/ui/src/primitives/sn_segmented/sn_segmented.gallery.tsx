'use client';

import * as React from 'react';
import { SNSegmented } from './sn_segmented';

const OPTIONS = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' },
  { value: 'dense', label: 'Dense', disabled: true },
];

export function SNSegmentedGallery() {
  const [value, setValue] = React.useState('comfortable');
  return (
    <section aria-labelledby="gallery-sn-segmented" className="space-y-3">
      <h2 id="gallery-sn-segmented" className="text-lg font-semibold text-text">
        SNSegmented
      </h2>
      <SNSegmented aria-label="Density" value={value} onValueChange={setValue} options={OPTIONS} />
    </section>
  );
}
