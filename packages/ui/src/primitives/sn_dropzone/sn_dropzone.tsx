'use client';

import * as React from 'react';
import { Upload } from 'lucide-react';
import { cx } from '../../lib/cx';
import { focusRing } from '../../lib/focus';
import { useFieldControl } from '../../lib/field_context';

interface SNDropzoneMessages {
  type: string;
  size: string;
  count: string;
}

interface SNDropzoneBaseProps {
  label: string;
  hint?: string;
  /**
   * The selected files, listed under the zone. Omit it when the caller shows the
   * files itself (an upload queue with progress rows).
   */
  value?: readonly File[];
  /** Receives only accepted files; a rejected file shows the matching message. */
  onFilesChange: (files: File[]) => void;
  accept?: string;
  maxBytes?: number;
  disabled?: boolean;
  id?: string;
  className?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

/**
 * Single mode rejects a drop of several files, so it needs the count message.
 * Multiple mode keeps the valid files of a mixed drop and reports the rest; it
 * needs the count message only when `maxFiles` caps the selection.
 */
export type SNDropzoneProps = SNDropzoneBaseProps &
  (
    | { multiple?: false; maxFiles?: never; messages: SNDropzoneMessages }
    | { multiple: true; maxFiles: number; messages: SNDropzoneMessages }
    | { multiple: true; maxFiles?: undefined; messages: Omit<SNDropzoneMessages, 'count'> }
  );

type SNDropzoneError = keyof SNDropzoneMessages;

function acceptsFile(file: File, accept: string): boolean {
  return accept.split(',').some((entry) => {
    const rule = entry.trim().toLowerCase();
    if (!rule) return false;
    if (rule.startsWith('.')) return file.name.toLowerCase().endsWith(rule);
    if (rule.endsWith('/*')) return file.type.toLowerCase().startsWith(rule.slice(0, -1));
    return file.type.toLowerCase() === rule;
  });
}

export function SNDropzone({
  label,
  hint,
  value,
  onFilesChange,
  accept,
  multiple = false,
  maxFiles,
  maxBytes,
  disabled = false,
  className,
  messages,
  ...props
}: SNDropzoneProps) {
  const input = React.useRef<HTMLInputElement>(null);
  const depth = React.useRef(0);
  const [dragging, setDragging] = React.useState(false);
  const [error, setError] = React.useState<SNDropzoneError | null>(null);
  const uid = React.useId();
  const a11y = useFieldControl(props);
  const hintId = `${uid}-hint`;
  const errorId = `${uid}-error`;
  const describedBy =
    [a11y['aria-describedby'], hint ? hintId : null, error ? errorId : null]
      .filter(Boolean)
      .join(' ') || undefined;
  const errorText = error === null ? null : (messages as Partial<SNDropzoneMessages>)[error];

  function rejection(file: File): SNDropzoneError | null {
    if (accept && !acceptsFile(file, accept)) return 'type';
    if (file.size === 0 || (maxBytes !== undefined && file.size > maxBytes)) return 'size';
    return null;
  }

  function select(files: File[]) {
    if (disabled || !files.length) return;
    if ((!multiple && files.length > 1) || (maxFiles !== undefined && files.length > maxFiles)) {
      setError('count');
      return;
    }
    const reasons = files.map(rejection);
    const accepted = files.filter((_, index) => reasons[index] === null);
    setError(reasons.find((reason) => reason !== null) ?? null);
    // Single mode is all or nothing; multiple mode keeps what it can upload.
    if (accepted.length && (multiple || accepted.length === files.length)) onFilesChange(accepted);
  }

  return (
    <div
      className={cx('space-y-2', className)}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!disabled && event.dataTransfer.types.includes('Files')) {
          depth.current += 1;
          setDragging(true);
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        depth.current = 0;
        setDragging(false);
        select(Array.from(event.dataTransfer.files));
      }}
    >
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        aria-label={label}
        hidden
        tabIndex={-1}
        onChange={(event) => {
          select(Array.from(event.currentTarget.files ?? []));
          event.currentTarget.value = '';
        }}
      />
      <button
        type="button"
        id={a11y.id}
        disabled={disabled}
        aria-describedby={describedBy}
        aria-invalid={error ? true : a11y['aria-invalid']}
        onClick={() => input.current?.click()}
        className={cx(
          'flex min-h-36 w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-5 py-6 text-center text-sm transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-45',
          focusRing,
          error || a11y['aria-invalid']
            ? 'border-danger bg-surface'
            : dragging && !disabled
              ? 'border-focus bg-(--state-hover)'
              : 'border-border-strong bg-surface hover:bg-(--state-hover)',
        )}
      >
        <Upload aria-hidden="true" className="size-6 text-text-secondary" />
        <span className="font-medium text-text">{label}</span>
      </button>
      {hint ? (
        <p id={hintId} className="text-sm text-text-secondary">
          {hint}
        </p>
      ) : null}
      {value ? (
        <div role="status" aria-live="polite" className="space-y-1 text-sm text-text">
          {value.map((file, index) => (
            <p key={`${file.name}-${index}`} className="break-all">
              {file.name}
            </p>
          ))}
        </div>
      ) : null}
      {errorText ? (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {errorText}
        </p>
      ) : null}
    </div>
  );
}
