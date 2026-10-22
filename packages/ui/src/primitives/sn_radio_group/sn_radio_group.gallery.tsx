'use client';

import * as React from 'react';
import { SNRadioGroup } from './sn_radio_group';

const OPTIONS = [
  { value: 'one', label: 'Comfortable', description: 'More space between rows' },
  { value: 'two', label: 'Compact' },
  { value: 'three', label: 'Disabled', disabled: true },
];

export function SNRadioGroupGallery() {
  const [list, setList] = React.useState('one');
  const [cards, setCards] = React.useState('two');
  return (
    <section aria-labelledby="gallery-sn-radio-group" className="max-w-md space-y-4">
      <h2 id="gallery-sn-radio-group" className="text-lg font-semibold text-text">
        SNRadioGroup
      </h2>
      <SNRadioGroup aria-label="List" name="gallery-list" value={list} onValueChange={setList} options={OPTIONS} />
      <SNRadioGroup aria-label="Cards" name="gallery-cards" variant="cards" value={cards} onValueChange={setCards} options={OPTIONS} />
    </section>
  );
}
