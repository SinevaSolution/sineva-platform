'use client';

import * as React from 'react';
import { type ExternalToast, Toaster, toast } from 'sonner';

export interface SNToasterProps {
  /** `system` follows the operating system; pass the resolved app theme when the app has one. */
  theme?: 'light' | 'dark' | 'system';
  /** Accessible name of each toast's close button. Sonner's default is English, so pass a translation. */
  closeLabel?: string;
}

// Sonner paints from its own theme variables, set on `[data-sonner-toaster]`
// with a hard-coded palette that ignores data-theme. An inline style on the
// list beats that stylesheet, so mapping the variables to semantic tokens is
// what makes toasts follow the app theme. There is no info or warning surface
// token yet, so those two kinds render as the neutral surface (the icon still
// tells them apart); success and error use the existing surface tokens.
const TOKEN_VARS = {
  // A toast sits above a modal: --z-toast (110) > --z-modal (100). Inline,
  // because sonner's own `z-index: 999999999` rule would beat a utility class.
  zIndex: 'var(--z-toast)',
  '--border-radius': 'var(--radius-md)',
  '--normal-bg': 'var(--color-surface)',
  '--normal-border': 'var(--color-border)',
  '--normal-text': 'var(--color-text)',
  '--success-bg': 'var(--color-success-surface)',
  '--success-border': 'var(--color-border)',
  '--success-text': 'var(--color-success)',
  '--error-bg': 'var(--color-danger-surface)',
  '--error-border': 'var(--color-border)',
  '--error-text': 'var(--color-danger)',
  '--info-bg': 'var(--color-surface)',
  '--info-border': 'var(--color-border)',
  '--info-text': 'var(--color-text)',
  '--warning-bg': 'var(--color-surface)',
  '--warning-border': 'var(--color-border)',
  '--warning-text': 'var(--color-text)',
} as React.CSSProperties;

// Sonner's buttons carry no focus ring of their own in the app's colors.
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

/**
 * Mount once near the root, outside any modal. Toasts announce through
 * sonner's `aria-live="polite"` region, close after 5 seconds, and pause while
 * the pointer is over them or the window is blurred (sonner's behavior).
 */
export function SNToaster({ theme = 'system', closeLabel }: SNToasterProps) {
  return (
    <Toaster
      // Bottom end. Sonner centers the stack on phones (max-width 600px).
      position="bottom-right"
      duration={5000}
      richColors
      closeButton
      theme={theme}
      style={TOKEN_VARS}
      toastOptions={{
        closeButtonAriaLabel: closeLabel,
        classNames: {
          toast: 'font-sans',
          closeButton: FOCUS,
          actionButton: FOCUS,
        },
      }}
    />
  );
}

export type SNToastOptions = ExternalToast;

/**
 * Same call signature as sonner's `toast`: `snToast.error(text, { action: { label, onClick } })`.
 * A helper, not a component, so it is not SN-capitalized. Each method returns
 * the toast id, which `dismiss(id)` takes (no id dismisses all).
 */
export const snToast = {
  success: toast.success,
  error: toast.error,
  info: toast.info,
  warning: toast.warning,
  message: toast.message,
  dismiss: toast.dismiss,
};
