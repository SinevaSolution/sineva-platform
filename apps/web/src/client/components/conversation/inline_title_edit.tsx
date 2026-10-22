'use client';

import * as React from 'react';
import { cn } from '@/client/components/ui/cn';
import { CONVERSATION_TITLE_MAX, resolveTitleEdit } from './conversation_title';

/**
 * A title turned into a text field. Enter saves, Escape cancels, blur saves,
 * and an empty or unchanged draft cancels (see `resolveTitleEdit`). The
 * parent unmounts it from `onSave` or `onCancel`, and unmounting a focused
 * input fires blur, so `settled` makes sure only the first outcome counts.
 */
export function InlineTitleEdit({
  value,
  label,
  onSave,
  onCancel,
  className,
}: {
  value: string | null;
  /** Accessible name of the field. */
  label: string;
  onSave: (title: string) => void;
  onCancel: () => void;
  className?: string;
}) {
  const [draft, setDraft] = React.useState(value ?? '');
  const inputRef = React.useRef<HTMLInputElement>(null);
  const settled = React.useRef(false);

  React.useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function finish() {
    if (settled.current) return;
    settled.current = true;
    const edit = resolveTitleEdit(value, draft);
    if (edit.kind === 'save') onSave(edit.title);
    else onCancel();
  }

  function cancel() {
    if (settled.current) return;
    settled.current = true;
    onCancel();
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      maxLength={CONVERSATION_TITLE_MAX}
      aria-label={label}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={finish}
      onKeyDown={(e) => {
        // Keep keys from reaching a surrounding dialog, link or menu.
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          finish();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }
      }}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'min-w-0 rounded-xs border border-focus bg-surface px-1.5 text-text outline-none focus-visible:ring-2 focus-visible:ring-focus/40',
        className,
      )}
    />
  );
}
