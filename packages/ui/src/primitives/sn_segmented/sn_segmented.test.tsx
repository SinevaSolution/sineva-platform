// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SNSegmented } from './sn_segmented';

afterEach(cleanup);

const options = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' },
  { value: 'dense', label: 'Dense' },
];

function setup(value = 'comfortable') {
  const onValueChange = vi.fn();
  render(<SNSegmented aria-label="Density" value={value} onValueChange={onValueChange} options={options} />);
  return { onValueChange };
}

describe('SNSegmented', () => {
  it('is a radiogroup of radios with the group name', () => {
    setup();
    expect(screen.getByRole('radiogroup', { name: 'Density' })).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('marks the selected segment with aria-checked', () => {
    setup('compact');
    expect(screen.getByRole('radio', { name: 'Compact' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Comfortable' }).getAttribute('aria-checked')).toBe('false');
  });

  it('puts only the selected segment in the tab order', () => {
    setup('compact');
    expect(screen.getByRole('radio', { name: 'Compact' }).getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('radio', { name: 'Comfortable' }).getAttribute('tabindex')).toBe('-1');
  });

  it('selects on click', () => {
    const { onValueChange } = setup();
    fireEvent.click(screen.getByRole('radio', { name: 'Compact' }));
    expect(onValueChange).toHaveBeenCalledWith('compact');
  });

  it('moves and selects with the arrow keys, wrapping around', () => {
    const { onValueChange } = setup('comfortable');
    const first = screen.getByRole('radio', { name: 'Comfortable' });
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(onValueChange).toHaveBeenLastCalledWith('compact');
    fireEvent.keyDown(first, { key: 'ArrowLeft' });
    expect(onValueChange).toHaveBeenLastCalledWith('dense');
  });

  it('jumps to the ends with Home and End', () => {
    const { onValueChange } = setup('compact');
    const el = screen.getByRole('radio', { name: 'Compact' });
    fireEvent.keyDown(el, { key: 'End' });
    expect(onValueChange).toHaveBeenLastCalledWith('dense');
    fireEvent.keyDown(el, { key: 'Home' });
    expect(onValueChange).toHaveBeenLastCalledWith('comfortable');
  });

  it('moves focus to the newly selected segment', () => {
    setup('comfortable');
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Comfortable' }), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Compact' }));
  });

  it('keeps each segment at least 44 px high on coarse pointers', () => {
    setup();
    expect(screen.getByRole('radio', { name: 'Compact' }).className).toContain('pointer-coarse:h-11');
  });
});
