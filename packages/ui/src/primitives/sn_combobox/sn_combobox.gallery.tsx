'use client';

import * as React from 'react';
import { SNField } from '../sn_field/sn_field';
import { SNCombobox } from './sn_combobox';

const ZONES = [
  'Asia/Jakarta',
  'Asia/Makassar',
  'Asia/Jayapura',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'UTC',
].map((zone) => ({ value: zone, label: zone }));

const LABELS = {
  placeholder: 'Pick a time zone',
  searchPlaceholder: 'Search time zones',
  searchLabel: 'Search time zones',
  emptyLabel: 'No time zone found',
};

export function SNComboboxGallery() {
  const [value, setValue] = React.useState('Asia/Jakarta');
  const [empty, setEmpty] = React.useState('');
  return (
    <section aria-labelledby="gallery-sn-combobox" className="max-w-sm space-y-4">
      <h2 id="gallery-sn-combobox" className="text-lg font-semibold text-text">
        SNCombobox
      </h2>
      <SNField label="Selected" hint="Type to search">
        <SNCombobox value={value} onValueChange={setValue} options={ZONES} {...LABELS} />
      </SNField>
      <SNField label="Placeholder">
        <SNCombobox value={empty} onValueChange={setEmpty} options={ZONES} {...LABELS} />
      </SNField>
      <SNField label="Error" error="Pick one">
        <SNCombobox value="" onValueChange={() => {}} options={ZONES} {...LABELS} />
      </SNField>
      <SNField label="Disabled">
        <SNCombobox value="UTC" onValueChange={() => {}} options={ZONES} disabled {...LABELS} />
      </SNField>
    </section>
  );
}
