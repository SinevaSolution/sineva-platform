import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SNGlow } from '@/client/components/ui/sn_glow';

const css = readFileSync(resolve(import.meta.dirname, '../app/globals.css'), 'utf8');

describe('SNGlow', () => {
  it('wraps its child in the glow container with the given radius', () => {
    const el = SNGlow({ radius: '22px', children: 'x' });
    expect(el.props.className).toContain('sn-glow');
    expect(el.props.style['--sn-glow-radius']).toBe('22px');
  });

  it('defines the ring, the aurora and a calmer state under reduced motion', () => {
    expect(css).toMatch(/@property --sn-glow-angle/);
    expect(css).toMatch(/\.sn-glow::before/);
    expect(css).toMatch(/\.sn-glow::after/);
    expect(css).toMatch(/\.sn-glow:focus-within::after/);
    expect(css).toMatch(/prefers-reduced-motion[\s\S]*\.sn-glow/);
  });
});
