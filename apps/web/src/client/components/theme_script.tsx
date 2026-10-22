'use client';

import * as React from 'react';
import { useServerInsertedHTML } from 'next/navigation';
import { THEME_SCRIPT } from '@sineva/ui/theme';

/** Inserts the theme bootstrap into the server HTML head, outside the hydrated React tree. */
export function ThemeScript({ nonce }: { nonce?: string }) {
  const inserted = React.useRef(false);
  useServerInsertedHTML(() => {
    if (inserted.current) return null;
    inserted.current = true;
    return <script id="sineva-theme" nonce={nonce}>{THEME_SCRIPT}</script>;
  });
  return null;
}
