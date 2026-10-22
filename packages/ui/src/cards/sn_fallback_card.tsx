import * as React from 'react';
import type { SNCardComponentProps } from './types';

type CopyState = 'idle' | 'copied' | 'failed';

/**
 * The renderer every card can fall back to (FR-AX-02, FR-AX-09): the card's
 * `fallback_text` as plain text, readable and copyable. It is also the whole
 * M0 card UI, so it ignores `data` on purpose.
 *
 * Text goes in as a React child, never as markup, so a fallback string that
 * contains HTML shows as characters. An `<article>` labelled by its heading
 * is how a screen reader finds the card (FR-AX-42; the full accessibility
 * spec arrives with the card shell).
 */
export function SNFallbackCard({ card, labels }: SNCardComponentProps) {
  const titleId = React.useId();
  const [copy, setCopy] = React.useState<CopyState>('idle');
  const text = card.fallback_text;

  async function copyText() {
    if (text === null) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopy('copied');
    } catch {
      // Clipboard access can be denied (permissions, insecure context). Say
      // so instead of leaving the person to wonder; the text stays selectable.
      setCopy('failed');
    }
  }

  return (
    <article
      aria-labelledby={titleId}
      className="mt-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2.5 text-[14px] leading-6 text-[var(--color-text)]"
    >
      <h4 id={titleId} className="text-xs font-semibold text-[var(--color-text-secondary)]">
        {labels.title}
      </h4>
      {card.validation_status === 'rejected' ? (
        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{labels.rejected_notice}</p>
      ) : null}
      <p className="mt-1 select-text whitespace-pre-wrap break-words">{text ?? labels.no_text}</p>
      {text !== null ? (
        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void copyText()}
            className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-lg px-3 text-xs font-semibold text-[var(--color-text-brand)] hover:bg-[var(--color-surface-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
          >
            {copy === 'copied' ? labels.copied : labels.copy}
          </button>
          <span role="status" className="text-xs text-[var(--color-text-secondary)]">
            {copy === 'failed' ? labels.copy_failed : ''}
          </span>
        </div>
      ) : null}
    </article>
  );
}
