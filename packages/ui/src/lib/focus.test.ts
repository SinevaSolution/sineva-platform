import { describe, expect, it } from 'vitest';
import { focusRing, focusRingInset, hitArea44 } from './focus';

describe('focus helpers (FR-UX-09, FR-DS-02)', () => {
  it('draws a 2 px outline in --color-focus with a 2 px offset on :focus-visible', () => {
    expect(focusRing).toBe('focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus');
  });

  it('pulls the ring inside for clipping containers (offset -2)', () => {
    expect(focusRingInset).toContain('focus-visible:outline-2');
    expect(focusRingInset).toContain('focus-visible:-outline-offset-2');
    expect(focusRingInset).toContain('focus-visible:outline-focus');
  });

  it('grows the hit area to 44 px with an invisible pseudo-element', () => {
    expect(hitArea44).toContain('after:h-11');
    expect(hitArea44).toContain('after:absolute');
  });

  it('uses logical or neutral utilities only, so the design lint passes on them', () => {
    expect(hitArea44).not.toMatch(/(?<![\w-])(?:left|right)-/);
  });
});
