'use client';

import { ClipboardPaste, Eye, EyeOff } from 'lucide-react';
import * as React from 'react';
import { SNButton, SNField, SNIconButton, SNInput } from '@sineva/ui';
import { useTranslations } from '@/i18n/provider';

/** A revealed key hides itself again after this long. */
export const REVEAL_MS = 30_000;

/**
 * Masked field for a key the person pastes. The value lives in the parent's
 * state only: this component writes it nowhere (no storage, no URL, no form
 * persistence), and the parent clears it on cancel and after save. Reveal is
 * possible only while there is unsaved input, and re-masks after 30 seconds.
 */
export function SecretField({
  label,
  value,
  onChange,
  hint,
  error,
  disabled = false,
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string | null;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const t = useTranslations('connections');
  const [revealed, setRevealed] = React.useState(false);
  // An emptied field is masked whatever `revealed` says, so typing again later
  // never silently shows the new value.
  const shown = revealed && value !== '' && !disabled;
  const canPaste = typeof navigator !== 'undefined' && typeof navigator.clipboard?.readText === 'function';

  React.useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setRevealed(false), REVEAL_MS);
    return () => clearTimeout(timer);
  }, [shown]);

  function change(next: string) {
    if (next === '') setRevealed(false);
    onChange(next);
  }

  async function paste() {
    try {
      change((await navigator.clipboard.readText()).trim());
    } catch {
      // Clipboard permission refused: the person can still paste into the field.
    }
  }

  return (
    <div className="flex items-start gap-2">
      <SNField label={label} hint={hint} error={error} className="min-w-0 flex-1">
        <SNInput
          type={shown ? 'text' : 'password'}
          value={value}
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete="new-password"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-autocomplete="none"
          className="font-mono"
          onChange={(event) => change(event.target.value)}
          // A pasted key often carries a trailing newline from the provider's
          // page. The whole value is replaced: a key is pasted, not edited in place.
          onPaste={(event) => {
            const text = event.clipboardData.getData('text');
            event.preventDefault();
            change(text.trim());
          }}
          endAdornment={
            <SNIconButton
              label={shown ? t('form.hide_key') : t('form.show_key')}
              size="sm"
              pressed={shown}
              disabled={value === '' || disabled}
              onClick={() => setRevealed((v) => !v)}
            >
              {shown ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </SNIconButton>
          }
        />
      </SNField>
      {canPaste ? (
        // Aligned with the input row, not the label row above it.
        <SNButton variant="secondary" className="mt-[1.625rem]" disabled={disabled} onClick={() => void paste()}>
          <ClipboardPaste aria-hidden="true" />
          {t('form.paste')}
        </SNButton>
      ) : null}
    </div>
  );
}
