// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SNPill } from './sn_pill';

afterEach(cleanup);

// Copied from `Pill` in apps/web/src/client/components/ui/controls.tsx: the
// two must stay pixel-identical until the app switches to this one.
const BASE = 'inline-flex h-5 items-center rounded-full px-2 text-xs font-medium';

describe('SNPill', () => {
  it.each([
    ['positive', 'bg-surface-tint text-text-brand'],
    ['brand', 'bg-action-primary text-text-inverse'],
    ['neutral', 'bg-canvas-alt text-text-secondary'],
  ] as const)('tone %s keeps the app Pill classes', (tone, extra) => {
    render(<SNPill tone={tone}>Label</SNPill>);
    expect(screen.getByText('Label').className).toBe(`${BASE} ${extra}`);
  });

  it('appends a caller className last', () => {
    render(
      <SNPill tone="neutral" className="ms-2">
        Label
      </SNPill>,
    );
    expect(screen.getByText('Label').className.endsWith(' ms-2')).toBe(true);
  });
});
