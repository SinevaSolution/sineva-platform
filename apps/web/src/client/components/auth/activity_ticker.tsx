'use client';

import * as React from 'react';
import { SinoFigure } from '@/client/components/ui/sino_figure';
import type { SinoPose } from '@/client/components/ui/specialist_accent';
import { useTranslations } from '@/i18n/provider';

// `name` is the product name (never translated); `textKey` is a literal so the
// key-usage check can follow it.
const ITEMS: { pose: SinoPose; name: string; textKey: string }[] = [
  { pose: 'coins', name: 'SinoFinance', textKey: 'ticker.sinofinance' },
  { pose: 'handshake', name: 'SinoSales', textKey: 'ticker.sinosales' },
  { pose: 'megaphone', name: 'SinoSocial', textKey: 'ticker.sinosocial' },
  { pose: 'holding-phone', name: 'SinoHelp', textKey: 'ticker.sinohelp' },
  { pose: 'whiteboard', name: 'SinoPeople', textKey: 'ticker.sinopeople' },
  { pose: 'magnifier', name: 'SinoInsights', textKey: 'ticker.sinoinsights' },
];

const INTERVAL_MS = 3200;

/**
 * One line at a time of what each specialist does. Crossfades on a timer;
 * holds the first line when the user prefers reduced motion, and pauses
 * while the tab is hidden so it never burns cycles in the background.
 */
export function ActivityTicker() {
  const t = useTranslations('auth');
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') setIndex((i) => (i + 1) % ITEMS.length);
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  const item = ITEMS[index];
  return (
    <div className="inline-flex h-12 items-center gap-2 rounded-full bg-[color-mix(in_oklab,var(--color-surface)_78%,transparent)] py-1 pl-1 pr-4 shadow-[0_1px_2px_rgba(11,42,49,0.06),0_8px_24px_-12px_rgba(11,42,49,0.18)] ring-1 ring-[color-mix(in_oklab,var(--color-border)_70%,transparent)] backdrop-blur-sm">
      <span key={item.name} className="anim-swap flex items-center gap-2">
        <SinoFigure pose={item.pose} size={40} />
        <span className="text-sm text-fg-secondary">
          <span className="font-semibold text-fg">{item.name}</span> {t(item.textKey)}
        </span>
      </span>
    </div>
  );
}
