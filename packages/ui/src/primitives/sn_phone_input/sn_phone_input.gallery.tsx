'use client';

import * as React from 'react';
import { SNField } from '../sn_field/sn_field';
import { SNPhoneInput } from './sn_phone_input';

const LABELS = {
  locale: 'en',
  countryLabel: 'Country code',
  searchPlaceholder: 'Search country or code',
  searchLabel: 'Search countries',
  emptyTitle: 'No country found',
  emptyDescription: 'Try a name, a code like ID or a dial code like +62.',
};

// Sample numbers only: +62 812 3456 7890 and +44 7400 123456 are shaped like
// real ones; +62 812 is the unfinished input that a form must refuse.
export function SNPhoneInputGallery() {
  const [empty, setEmpty] = React.useState('');
  const [filled, setFilled] = React.useState('+6281234567890');
  const [foreign, setForeign] = React.useState('+447400123456');
  return (
    <section aria-labelledby="gallery-sn-phone-input" className="max-w-sm space-y-4">
      <h2 id="gallery-sn-phone-input" className="text-lg font-semibold text-text">
        SNPhoneInput
      </h2>
      <SNField label="Empty (Indonesia by default)" hint="Type 0812... or paste +44...">
        <SNPhoneInput value={empty} onValueChange={setEmpty} {...LABELS} />
      </SNField>
      <SNField label="Filled">
        <SNPhoneInput value={filled} onValueChange={setFilled} {...LABELS} />
      </SNField>
      <SNField label="Another country">
        <SNPhoneInput value={foreign} onValueChange={setForeign} {...LABELS} />
      </SNField>
      <SNField label="Indonesian list" hint="Country names follow the language">
        <SNPhoneInput value="" onValueChange={() => {}} {...LABELS} locale="id" countryLabel="Kode negara" searchLabel="Cari negara" />
      </SNField>
      <SNField label="Error" error="Enter a valid phone number">
        <SNPhoneInput value="+62812" onValueChange={() => {}} {...LABELS} />
      </SNField>
      <SNField label="Disabled">
        <SNPhoneInput value="+6281234567890" onValueChange={() => {}} disabled {...LABELS} />
      </SNField>
    </section>
  );
}
