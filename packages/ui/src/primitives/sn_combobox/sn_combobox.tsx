'use client';

import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Command } from 'cmdk';
import { Check, ChevronsUpDown } from 'lucide-react';
import * as React from 'react';
import { controlHeight, controlSurface } from '../../lib/control';
import { cx } from '../../lib/cx';
import { useFieldControl } from '../../lib/field_context';

export interface SNComboboxOption {
  value: string;
  label: string;
  /** Extra words that should find this option (a city for a time zone). */
  keywords?: readonly string[];
  disabled?: boolean;
}

export interface SNComboboxProps {
  options: readonly SNComboboxOption[];
  value: string;
  onValueChange: (value: string) => void;
  /** Trigger text while `value` matches no option. */
  placeholder: string;
  searchPlaceholder: string;
  /** Accessible name of the search box inside the list. */
  searchLabel: string;
  /** Shown when the search matches nothing. */
  emptyLabel: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  className?: string;
}

// Identifiers like Asia/Jakarta or America/New_York are searched by words, so
// separators count as spaces ("new york" must find America/New_York).
const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[_/\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * cmdk filter. Every word of the search must appear somewhere in the option
 * (value, label or keywords); a label that starts with the search ranks above
 * one that only contains it. Not cmdk's default scorer: that one is a fuzzy
 * subsequence match, which makes "ny" match "Asia/Kolkata" among other noise,
 * a bad trade for a list people search by name.
 */
export function snComboboxFilter(value: string, search: string, keywords: readonly string[] = []): number {
  const words = normalize(search).split(' ').filter(Boolean);
  if (words.length === 0) return 1;
  const haystack = normalize([value, ...keywords].join(' '));
  if (!words.every((word) => haystack.includes(word))) return 0;
  const first = normalize(keywords[0] ?? value);
  return first.startsWith(normalize(search)) ? 2 : 1;
}

/**
 * Single choice with search, for lists too long to scan (time zones,
 * countries). A `combobox` button opens a popover with a search box and a
 * `listbox` (cmdk): type to filter, arrows to move, Enter to choose, Escape to
 * close and return focus to the button.
 *
 * Why a popover with the input inside, not an editable input as the
 * combobox: the button keeps the field a plain picker on touch screens (no
 * keyboard pops up until the person asks to search) and the selected value
 * stays readable while the list is open.
 */
export function SNCombobox({
  options,
  value,
  onValueChange,
  placeholder,
  searchPlaceholder,
  searchLabel,
  emptyLabel,
  name,
  disabled,
  required,
  className,
  ...aria
}: SNComboboxProps) {
  const a11y = useFieldControl({ ...aria, required });
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const listId = React.useId();
  const selected = options.find((option) => option.value === value);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    // A stale query would reopen a list that looks empty or half filtered.
    if (!next) setSearch('');
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          role="combobox"
          id={a11y.id}
          aria-label={aria['aria-label']}
          aria-labelledby={aria['aria-labelledby']}
          aria-describedby={a11y['aria-describedby']}
          aria-invalid={a11y['aria-invalid']}
          aria-required={a11y.required}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          disabled={disabled}
          className={cx(
            controlSurface,
            controlHeight,
            'flex cursor-pointer items-center justify-between gap-2 text-start',
            !selected && 'text-text-tertiary',
            className,
          )}
        >
          <span className="min-w-0 flex-1 truncate">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 text-text-tertiary" />
        </button>
      </PopoverPrimitive.Trigger>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          collisionPadding={8}
          className="anim-swap z-(--z-popover) w-(--radix-popover-trigger-width) min-w-56 overflow-hidden rounded-md border border-border bg-surface shadow-md [--d:0ms]"
        >
          <Command label={searchLabel} filter={snComboboxFilter} loop>
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder={searchPlaceholder}
              aria-label={searchLabel}
              className="h-11 w-full border-b border-border bg-transparent px-3 text-[15px] pointer-coarse:text-base text-text outline-none placeholder:text-text-tertiary"
            />
            <Command.List id={listId} className="max-h-64 overflow-y-auto p-1">
              <Command.Empty className="px-3 py-6 text-center text-[13px] text-text-tertiary">{emptyLabel}</Command.Empty>
              {options.map((option) => (
                <Command.Item
                  key={option.value}
                  value={option.value}
                  keywords={[option.label, ...(option.keywords ?? [])]}
                  disabled={option.disabled}
                  onSelect={() => {
                    onValueChange(option.value);
                    handleOpenChange(false);
                  }}
                  className="relative flex min-h-9 cursor-default select-none items-center rounded-xs py-1.5 ps-8 pe-2 text-[14px] text-text outline-none pointer-coarse:min-h-11 data-[disabled=true]:opacity-45 data-[selected=true]:bg-(--state-hover)"
                >
                  {option.value === value ? (
                    <Check aria-hidden="true" className="absolute start-2 size-4 text-text-brand" />
                  ) : null}
                  <span className="min-w-0 truncate">{option.label}</span>
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
