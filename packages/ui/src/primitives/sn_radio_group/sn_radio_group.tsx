'use client';

import * as React from 'react';
import { cx } from '../../lib/cx';
import { focusRing } from '../../lib/focus';

export interface SNRadioOption {
  value: string;
  label: React.ReactNode;
  description?: string;
  disabled?: boolean;
}

export interface SNRadioGroupProps {
  options: readonly SNRadioOption[];
  value: string;
  onValueChange: (value: string) => void;
  /** Shared by every radio: the browser gives the group arrow-key movement from it. */
  name: string;
  /** Stacked rows (`list`) or bordered cards (`cards`). Same semantics either way. */
  variant?: 'list' | 'cards';
  orientation?: 'vertical' | 'horizontal';
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  className?: string;
}

/**
 * Native radios in a `radiogroup`. Native for the same reason as SNCheckbox:
 * arrow keys, Tab-into-the-checked-one and form values come from the browser,
 * so there is no roving-tabindex code to get subtly wrong.
 */
export function SNRadioGroup({
  options,
  value,
  onValueChange,
  name,
  variant = 'list',
  orientation = 'vertical',
  className,
  ...aria
}: SNRadioGroupProps) {
  const baseId = React.useId();
  const cards = variant === 'cards';

  return (
    <div
      role="radiogroup"
      {...aria}
      className={cx(
        cards ? 'grid gap-2.5' : 'flex gap-x-6',
        !cards && (orientation === 'vertical' ? 'flex-col' : 'flex-row flex-wrap'),
        cards && orientation === 'horizontal' && 'sm:grid-cols-2',
        className,
      )}
    >
      {options.map((option, index) => {
        const descriptionId = option.description ? `${baseId}-${index}-description` : undefined;
        return (
          <label
            key={option.value}
            className={cx(
              'flex min-h-11 items-start gap-3',
              option.disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer',
              cards
                ? 'rounded-md border border-border-strong bg-surface p-3 transition-[border-color,box-shadow] has-checked:border-focus has-checked:shadow-(--shadow-focus-halo) has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus'
                : 'py-2.5',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              disabled={option.disabled}
              aria-describedby={descriptionId}
              onChange={() => {
                if (!option.disabled) onValueChange(option.value);
              }}
              className={cx(
                'mt-px size-5 shrink-0 cursor-[inherit] appearance-none rounded-full border border-border-input bg-surface transition-colors checked:border-action-primary checked:bg-action-primary checked:shadow-[inset_0_0_0_3px_var(--color-surface)]',
                // Cards show focus on the whole card (has-focus-visible above).
                cards ? 'outline-none' : focusRing,
              )}
            />
            <span className="min-w-0">
              <span className="block text-[15px] text-text">{option.label}</span>
              {option.description ? (
                <span id={descriptionId} className="mt-0.5 block text-[13px] text-text-tertiary">
                  {option.description}
                </span>
              ) : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}
