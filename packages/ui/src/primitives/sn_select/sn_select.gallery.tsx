'use client';

import * as React from 'react';
import { SNField } from '../sn_field/sn_field';
import { SNSelect } from './sn_select';

const OPTIONS = [
  { value: '', label: 'Not set' },
  { value: 'mr', label: 'Mr.' },
  { value: 'ms', label: 'Ms.' },
  { value: 'dr', label: 'Dr.', disabled: true },
];

export function SNSelectGallery() {
  const [value, setValue] = React.useState('mr');
  const [empty, setEmpty] = React.useState('unset');
  return (
    <section aria-labelledby="gallery-sn-select" className="max-w-sm space-y-4">
      <h2 id="gallery-sn-select" className="text-lg font-semibold text-text">
        SNSelect
      </h2>
      <SNField label="Selected" hint="Single choice">
        <SNSelect value={value} onValueChange={setValue} options={OPTIONS} />
      </SNField>
      <SNField label="Placeholder">
        <SNSelect value={empty} onValueChange={setEmpty} options={OPTIONS.slice(1)} placeholder="Choose one" />
      </SNField>
      <SNField label="Error" error="Pick one">
        <SNSelect value="unset" onValueChange={() => {}} options={OPTIONS.slice(1)} placeholder="Choose one" />
      </SNField>
      <SNField label="Disabled">
        <SNSelect value="ms" onValueChange={() => {}} options={OPTIONS} disabled />
      </SNField>
    </section>
  );
}
