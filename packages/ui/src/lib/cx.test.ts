import { describe, expect, it } from 'vitest';
import { cx } from './cx';

describe('cx', () => {
  it('joins truthy class names in order', () => {
    expect(cx('a', 'b', 'c')).toBe('a b c');
  });

  it('drops false, null, undefined and empty strings', () => {
    expect(cx('a', false, null, undefined, '', 'b')).toBe('a b');
  });

  it('does not merge conflicting utilities: the caller picks the right map entry', () => {
    // No tailwind-merge on purpose. Both classes stay; Tailwind's own
    // stylesheet order decides, which is why variants come from static maps.
    expect(cx('p-2', 'p-4')).toBe('p-2 p-4');
  });
});
