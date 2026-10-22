'use client';

import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Command } from 'cmdk';
import { Check, ChevronDown, SearchX } from 'lucide-react';
import * as React from 'react';
import { cx } from '../../lib/cx';
import { useFieldControl } from '../../lib/field_context';
import { SNEmptyState } from '../sn_empty_state/sn_empty_state';
import {
  buildCountries,
  DEFAULT_COUNTRY,
  FAVOURITE_COUNTRIES,
  phoneFromText,
  phoneFromValue,
  phoneWithCountry,
  scoreCountry,
  type CountryCode,
  type PhoneCountry,
  type PhoneDraft,
} from './phone_data';

export interface SNPhoneInputProps {
  /** E.164 ("+6281234567890"), or '' for no number. */
  value: string;
  /**
   * Called with E.164 when the number is complete and valid. While it is not,
   * the value is an unfinished E.164-shaped string ("+62812") so a form can
   * tell "empty" from "unfinished" and refuse to save the latter: check it with
   * `snIsValidPhoneNumber`. '' only means nothing was typed.
   */
  onValueChange: (value: string) => void;
  /** UI language, for country names and sorting ("en", "id"). */
  locale: string;
  /** Accessible name of the country button; the chosen country is appended ("Country code: Indonesia +62"). */
  countryLabel: string;
  searchPlaceholder: string;
  /** Accessible name of the search box inside the list. */
  searchLabel: string;
  /** Title of the state shown when the search matches no country. */
  emptyTitle: string;
  /** One sentence under the title: what to try. */
  emptyDescription: string;
  /** Country picked while the value is empty, and pinned first in the list. Default Indonesia. */
  defaultCountry?: CountryCode;
  /** Pinned after the default. Default Malaysia, Singapore, Australia, United States. */
  favouriteCountries?: readonly CountryCode[];
  placeholder?: string;
  /** Id for the number input (the field label points at it). */
  id?: string;
  /** Submits the E.164 value in a hidden input. */
  name?: string;
  disabled?: boolean;
  required?: boolean;
  /** Fires when the number input loses focus (not when focus moves to the country button's list). */
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  className?: string;
}

// cmdk hands the filter the item's value and keywords; the keywords carry the
// four fields scoreCountry reads.
function filterCountries(_value: string, search: string, keywords: readonly string[] = []): number {
  const [name = '', englishName = '', iso = '', dial = ''] = keywords;
  return scoreCountry(search, { name, englishName, iso: iso as CountryCode, dial });
}

/**
 * Phone number in one field: a country button (flag and dial code) that opens a
 * searchable list, and the national number next to it. Value in and out is
 * E.164.
 *
 * Why two controls in one bordered box, not an SNInput with an adornment: the
 * country button is interactive and has its own popup, and an SNInput
 * adornment is decorative. The box takes the SNInput look (hairline border,
 * focus halo, danger border on error) from `:focus-within` and the invalid
 * state, so it reads as one field.
 *
 * Why the list is the SNCombobox pattern (popover, cmdk) and not a sheet:
 * that is what the other long pickers do, and the popover already keeps inside
 * the viewport on a phone.
 *
 * Gotcha: a number is read in the picked country, so "0812..." with Indonesia
 * selected is +62812... but the same text with Singapore selected is not.
 * Typing or pasting a "+" number is the one case where the number overrules the
 * picker and the country switches.
 */
export function SNPhoneInput({
  value,
  onValueChange,
  locale,
  countryLabel,
  searchPlaceholder,
  searchLabel,
  emptyTitle,
  emptyDescription,
  defaultCountry = DEFAULT_COUNTRY,
  favouriteCountries = FAVOURITE_COUNTRIES,
  placeholder,
  name,
  disabled,
  required,
  onBlur,
  className,
  ...aria
}: SNPhoneInputProps) {
  const a11y = useFieldControl({ ...aria, required });
  const countries = React.useMemo(
    () => buildCountries(locale, { defaultCountry, favourites: favouriteCountries }),
    [locale, defaultCountry, favouriteCountries],
  );

  const [draft, setDraft] = React.useState<PhoneDraft>(() => phoneFromValue(value, defaultCountry));
  // The last value this component produced or accepted. A different `value`
  // comes from outside (discard, reload after save) and replaces the draft; the
  // echo of our own value does not, so typing never gets rewritten under the
  // caret. State and not a ref: it is read while rendering.
  const [synced, setSynced] = React.useState(value);
  if (value !== synced) {
    setSynced(value);
    setDraft(phoneFromValue(value, value ? draft.country : defaultCountry));
  }

  const [open, setOpen] = React.useState(false);
  const [listId, setListId] = React.useState<string | undefined>();
  const inputRef = React.useRef<HTMLInputElement>(null);
  // Set when the list closes because a country was picked, so focus goes on to
  // the number instead of back to the button.
  const pickedRef = React.useRef(false);

  const country = countries.find((entry) => entry.iso === draft.country) ?? (countries[0] as PhoneCountry);

  function commit(next: PhoneDraft) {
    setDraft(next);
    if (next.value !== synced) {
      setSynced(next.value);
      onValueChange(next.value);
    }
  }

  function handleText(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    // Rewriting the text of an edit in the middle would send the caret to the
    // end, so only edits at the end are reformatted.
    const atEnd = input.selectionStart === null || input.selectionStart >= input.value.length;
    commit(phoneFromText(input.value, draft.country, { reformat: atEnd }));
  }

  function pick(iso: CountryCode) {
    pickedRef.current = true;
    commit(phoneWithCountry(draft.text, iso));
    setOpen(false);
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Anchor asChild>
        <div
          data-slot="phone-field"
          data-invalid={a11y['aria-invalid'] ? 'true' : undefined}
          data-disabled={disabled ? 'true' : undefined}
          className={cx(
            'flex h-11 w-full items-center rounded-sm border border-border-strong bg-surface text-[15px] pointer-coarse:text-base text-text transition-[border-color,box-shadow] focus-within:border-focus focus-within:shadow-(--shadow-focus-halo) data-[invalid=true]:border-danger data-[disabled=true]:opacity-45',
            className,
          )}
        >
          <PopoverPrimitive.Trigger asChild>
            <button
              type="button"
              role="combobox"
              aria-label={`${countryLabel}: ${country.name} +${country.dial}`}
              aria-haspopup="listbox"
              aria-expanded={open}
              aria-controls={open ? listId : undefined}
              disabled={disabled}
              className="flex h-full shrink-0 cursor-pointer items-center gap-1.5 rounded-s-sm ps-3 pe-2 text-text outline-none hover:bg-(--state-hover) focus-visible:bg-(--state-hover) disabled:cursor-not-allowed"
            >
              {/* The flag is decoration: the name already says the country. */}
              <span aria-hidden="true" className="text-lg leading-none">
                {country.flag}
              </span>
              <span className="tabular-nums">+{country.dial}</span>
              <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-text-tertiary" />
            </button>
          </PopoverPrimitive.Trigger>
          <span aria-hidden="true" className="h-5 w-px shrink-0 bg-border" />
          <input
            ref={inputRef}
            id={a11y.id}
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            // Digits and "+" read left to right in every language.
            dir="ltr"
            value={draft.text}
            placeholder={placeholder}
            disabled={disabled}
            required={a11y.required}
            aria-label={aria['aria-label']}
            aria-labelledby={aria['aria-labelledby']}
            aria-describedby={a11y['aria-describedby']}
            aria-invalid={a11y['aria-invalid']}
            onChange={handleText}
            onBlur={onBlur}
            className="h-full min-w-0 flex-1 rounded-e-sm bg-transparent px-3 text-start outline-none placeholder:text-text-tertiary disabled:cursor-not-allowed"
          />
        </div>
      </PopoverPrimitive.Anchor>
      {name ? <input type="hidden" name={name} value={draft.value} /> : null}
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          collisionPadding={8}
          onCloseAutoFocus={(event) => {
            if (!pickedRef.current) return;
            pickedRef.current = false;
            event.preventDefault();
            inputRef.current?.focus();
          }}
          // The anchor is the whole field, so the list is as wide as the field.
          className="anim-swap z-(--z-dropdown) w-(--radix-popover-trigger-width) min-w-64 max-w-(--radix-popover-content-available-width) overflow-hidden rounded-md border border-border bg-surface shadow-md [--d:0ms]"
        >
          <CountryList
            countries={countries}
            selected={country.iso}
            searchPlaceholder={searchPlaceholder}
            searchLabel={searchLabel}
            emptyTitle={emptyTitle}
            emptyDescription={emptyDescription}
            onPick={pick}
            onListId={setListId}
          />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

interface CountryListProps {
  countries: readonly PhoneCountry[];
  selected: CountryCode;
  searchPlaceholder: string;
  searchLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  onPick: (iso: CountryCode) => void;
  onListId: (id: string | undefined) => void;
}

// Its own component so the search text lives and dies with the open list (the
// popover content is unmounted on close): a stale query would reopen a list
// that looks empty or half filtered.
function CountryList({
  countries,
  selected,
  searchPlaceholder,
  searchLabel,
  emptyTitle,
  emptyDescription,
  onPick,
  onListId,
}: CountryListProps) {
  const [search, setSearch] = React.useState('');
  const listRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    // cmdk owns the id of its listbox and ignores one passed in, so the button
    // reads it from the DOM for aria-controls.
    onListId(listRef.current?.id);
    // cmdk highlights the first row on mount but only publishes
    // `aria-activedescendant` once the highlight moves, so a screen reader
    // would open the list with no active option. End then Home ends on the
    // same first row with the id published. Not ArrowDown then ArrowUp: cmdk
    // finds the highlight in the DOM, which has not re-rendered between two
    // events in one tick, so the up arrow would wrap to the last row; Home and
    // End jump by index and do not read it. It waits a tick because the rows
    // are not registered before cmdk's first layout pass. Why not cmdk's
    // `defaultValue` or a controlled `value`: both skip the id as well.
    const search = searchRef.current;
    const nudge = window.setTimeout(() => {
      for (const key of ['End', 'Home']) {
        search?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      }
    }, 0);
    return () => {
      window.clearTimeout(nudge);
      onListId(undefined);
    };
  }, [onListId]);

  // The list opens on its first row (the pinned default), not on the chosen
  // country: cmdk's `defaultValue` would start on the chosen one but leaves
  // the active option unpublished (see the effect above). The chosen country
  // is marked with a check instead, and search finds any other.
  return (
    <Command label={searchLabel} filter={filterCountries} loop>
      <Command.Input
        ref={searchRef}
        value={search}
        onValueChange={setSearch}
        placeholder={searchPlaceholder}
        aria-label={searchLabel}
        className="h-11 w-full border-b border-border bg-transparent px-3 text-[15px] pointer-coarse:text-base text-text outline-none placeholder:text-text-tertiary"
      />
      <Command.List ref={listRef} className="max-h-64 overflow-y-auto p-1">
        <Command.Empty className="px-3 py-4">
          <SNEmptyState icon={SearchX} size="sm" headingLevel={3} title={emptyTitle} description={emptyDescription} />
        </Command.Empty>
        {countries.map((country) => (
          <Command.Item
            key={country.iso}
            value={country.iso}
            keywords={[country.name, country.englishName, country.iso, country.dial]}
            data-checked={country.iso === selected ? 'true' : undefined}
            onSelect={() => onPick(country.iso)}
            className="relative flex min-h-9 cursor-default select-none items-center gap-2 rounded-xs py-1.5 ps-8 pe-2 text-[14px] text-text outline-none pointer-coarse:min-h-11 data-[selected=true]:bg-(--state-hover)"
          >
            {country.iso === selected ? (
              <Check aria-hidden="true" className="absolute start-2 size-4 text-text-brand" />
            ) : null}
            <span aria-hidden="true" className="text-lg leading-none">
              {country.flag}
            </span>
            <span className="min-w-0 flex-1 truncate">{country.name}</span>
            <span className="shrink-0 text-text-tertiary tabular-nums">+{country.dial}</span>
          </Command.Item>
        ))}
      </Command.List>
    </Command>
  );
}
