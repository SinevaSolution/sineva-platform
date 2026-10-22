'use client';

import * as React from 'react';
import { cx } from '../../lib/cx';
import { focusRing } from '../../lib/focus';

export interface SNSegmentedOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface SNSegmentedProps {
  options: readonly SNSegmentedOption[];
  value: string;
  onValueChange: (value: string) => void;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  className?: string;
}

/**
 * A small set of mutually exclusive choices shown as one control (density,
 * view). A `radiogroup` with a roving tabindex: Tab enters on the selected
 * segment, arrow keys move and select (WAI-ARIA radio group), Home and End jump.
 * Not tabs: nothing here swaps a panel.
 */
export function SNSegmented({ options, value, onValueChange, className, ...aria }: SNSegmentedProps) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);

  function move(from: number, delta: 1 | -1 | 'start' | 'end') {
    if (enabled.length === 0) return;
    const at = enabled.indexOf(from);
    let target: number | undefined;
    if (delta === 'start') target = enabled[0];
    else if (delta === 'end') target = enabled[enabled.length - 1];
    else target = enabled[(at + delta + enabled.length) % enabled.length];
    if (target === undefined) return;
    const next = options[target];
    if (!next) return;
    onValueChange(next.value);
    refs.current[target]?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    // Arrow keys follow reading direction in RTL; the group is symmetric, so
    // both horizontal arrows are mapped without checking `dir`.
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        move(index, 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        move(index, -1);
        break;
      case 'Home':
        event.preventDefault();
        move(index, 'start');
        break;
      case 'End':
        event.preventDefault();
        move(index, 'end');
        break;
    }
  }

  // The selected segment is the tab stop; if nothing matches, the first one is.
  const selectedIndex = options.findIndex((o) => o.value === value);
  const tabStop = selectedIndex >= 0 ? selectedIndex : (enabled[0] ?? 0);

  return (
    <div role="radiogroup" {...aria} className={cx('inline-flex rounded-lg bg-canvas-alt p-1', className)}>
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={index === tabStop ? 0 : -1}
            disabled={option.disabled}
            onClick={() => onValueChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cx(
              'h-9 cursor-pointer rounded-md px-3.5 text-[13px] font-medium transition-colors pointer-coarse:h-11 disabled:cursor-not-allowed disabled:opacity-45',
              focusRing,
              selected ? 'bg-surface text-text shadow-sm' : 'text-text-secondary hover:text-text',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
