'use client';

import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import * as React from 'react';
import { controlHeight, controlSurface } from '../../lib/control';
import { cx } from '../../lib/cx';
import { useFieldControl } from '../../lib/field_context';

export interface SNSelectOption {
  value: string;
  label: string;
  /** Second line under the label (a role's one-sentence meaning). */
  description?: string;
  disabled?: boolean;
}

export interface SNSelectProps {
  options: readonly SNSelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  /** Shown while `value` matches no option. */
  placeholder?: string;
  id?: string;
  /** Submitted with a surrounding form through Radix's hidden native select. */
  name?: string;
  disabled?: boolean;
  required?: boolean;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  className?: string;
}

// Radix throws on `<Select.Item value="">` because the empty string means
// "cleared" to it. Forms here need a real "Not set" choice, so that one value
// is swapped for a sentinel on the way in and back on the way out.
const EMPTY = '__sn_empty__';
const toInternal = (value: string) => (value === '' ? EMPTY : value);
const fromInternal = (value: string) => (value === EMPTY ? '' : value);

/**
 * Single choice from a short list (up to about a dozen options; use
 * SNCombobox beyond that). Radix Select: the trigger is a `combobox` button,
 * the list is a portal `listbox`, with arrow keys, Home and End, typeahead,
 * Escape, focus return and a hidden native select for form values.
 *
 * Used instead of a native `<select>` because the open list of a native select
 * cannot follow the design and differs per OS.
 */
export function SNSelect({
  options,
  value,
  onValueChange,
  placeholder,
  name,
  disabled,
  required,
  className,
  ...aria
}: SNSelectProps) {
  const a11y = useFieldControl({ ...aria, required });
  const hasMatch = options.some((option) => option.value === value);

  return (
    <SelectPrimitive.Root
      value={hasMatch ? toInternal(value) : ''}
      onValueChange={(next) => onValueChange(fromInternal(next))}
      name={name}
      disabled={disabled}
      required={a11y.required}
    >
      <SelectPrimitive.Trigger
        id={a11y.id}
        aria-label={aria['aria-label']}
        aria-labelledby={aria['aria-labelledby']}
        aria-describedby={a11y['aria-describedby']}
        aria-invalid={a11y['aria-invalid']}
        className={cx(
          controlSurface,
          controlHeight,
          'flex cursor-pointer items-center justify-between gap-2 text-start data-[placeholder]:text-text-tertiary',
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-text-tertiary" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          collisionPadding={8}
          className="anim-swap z-(--z-popover) max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-hidden rounded-md border border-border bg-surface shadow-md [--d:0ms]"
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={toInternal(option.value)}
                disabled={option.disabled}
                className="relative flex min-h-9 cursor-default select-none items-center rounded-xs py-1.5 ps-8 pe-2 text-[14px] text-text outline-none pointer-coarse:min-h-11 data-[disabled]:opacity-45 data-[highlighted]:bg-(--state-hover)"
              >
                <SelectPrimitive.ItemIndicator className="absolute start-2 flex size-4 items-center justify-center text-text-brand">
                  <Check aria-hidden="true" className="size-4" />
                </SelectPrimitive.ItemIndicator>
                <span className="min-w-0">
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                  {option.description ? (
                    <span className="block text-[13px] text-text-tertiary">{option.description}</span>
                  ) : null}
                </span>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
