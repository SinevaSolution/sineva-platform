'use client';

import * as React from 'react';
import { SNTextarea } from './sn_textarea';

export function SNTextareaGallery() {
  const [text, setText] = React.useState('A short note about me.');
  const [long, setLong] = React.useState('x'.repeat(95));
  const format = (count: number, max: number) => `${count} / ${max}`;
  return (
    <section aria-labelledby="gallery-sn-textarea" className="max-w-sm space-y-3">
      <h2 id="gallery-sn-textarea" className="text-lg font-semibold text-text">
        SNTextarea
      </h2>
      <SNTextarea aria-label="Default" placeholder="Default" rows={3} />
      <SNTextarea aria-label="With counter" rows={3} value={text} onChange={(e) => setText(e.target.value)} max={100} formatCounter={format} />
      <SNTextarea aria-label="Near the limit" rows={3} value={long} onChange={(e) => setLong(e.target.value)} max={100} formatCounter={format} />
      <SNTextarea aria-label="Invalid" aria-invalid rows={3} defaultValue="Invalid" />
      <SNTextarea aria-label="Disabled" disabled rows={3} defaultValue="Disabled" />
    </section>
  );
}
