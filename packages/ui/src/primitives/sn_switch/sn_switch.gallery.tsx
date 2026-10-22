'use client';

import * as React from 'react';
import { SNSwitch } from './sn_switch';

export function SNSwitchGallery() {
  const [on, setOn] = React.useState(true);
  const [off, setOff] = React.useState(false);
  return (
    <section aria-labelledby="gallery-sn-switch" className="space-y-3">
      <h2 id="gallery-sn-switch" className="text-lg font-semibold text-text">
        SNSwitch
      </h2>
      <div className="flex items-center gap-4">
        <SNSwitch aria-label="On" checked={on} onCheckedChange={setOn} />
        <SNSwitch aria-label="Off" checked={off} onCheckedChange={setOff} />
        <SNSwitch aria-label="Disabled on" disabled checked onCheckedChange={() => {}} />
        <SNSwitch aria-label="Disabled off" disabled checked={false} onCheckedChange={() => {}} />
      </div>
    </section>
  );
}
