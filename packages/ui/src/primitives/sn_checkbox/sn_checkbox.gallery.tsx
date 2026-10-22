'use client';

import * as React from 'react';
import { SNCheckbox } from './sn_checkbox';

export function SNCheckboxGallery() {
  const [a, setA] = React.useState(false);
  const [b, setB] = React.useState(true);
  return (
    <section aria-labelledby="gallery-sn-checkbox" className="max-w-sm space-y-1">
      <h2 id="gallery-sn-checkbox" className="text-lg font-semibold text-text">
        SNCheckbox
      </h2>
      <SNCheckbox label="Unchecked" checked={a} onCheckedChange={setA} />
      <SNCheckbox label="Checked" description="With a description under the label" checked={b} onCheckedChange={setB} />
      <SNCheckbox label="Mixed" checked={false} indeterminate onCheckedChange={() => {}} />
      <SNCheckbox label="Invalid" aria-invalid checked={false} onCheckedChange={() => {}} />
      <SNCheckbox label="Disabled" disabled checked={false} onCheckedChange={() => {}} />
      <SNCheckbox label="Disabled checked" disabled checked onCheckedChange={() => {}} />
    </section>
  );
}
