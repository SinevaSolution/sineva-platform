'use client';

import { Pencil } from 'lucide-react';
import * as React from 'react';
import { SNButton, SNField, SNInput, SNTextarea } from '@sineva/ui';
import { cn } from '@/client/components/ui/cn';
import { useTranslations } from '@/i18n/provider';
import { diffWords, wordsChanged, type DiffPart } from './inbox_model';

export interface DraftText {
  title: string;
  body: string;
}

/** The draft as it will read, with the words that changed marked on each side. */
export function InboxDiff({ original, edited }: { original: string; edited: string }) {
  const t = useTranslations('inbox_ui');
  const parts = React.useMemo(() => diffWords(original, edited), [original, edited]);
  // Each side shows the words it has: the original keeps what was removed,
  // the edit keeps what was added, and both keep what did not change.
  const render = (hide: DiffPart['type'], markClass: string) =>
    parts
      .filter((part) => part.type !== hide)
      .map((part, index) => (
        <span key={index} className={cn(part.type !== 'same' && markClass)}>
          {part.text}
        </span>
      ));
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-sm bg-canvas-alt p-3">
        <p className="mb-1 text-xs font-medium text-text-tertiary">{t('diff_original')}</p>
        <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-text-secondary">
          {render('add', 'rounded-xs bg-danger-surface text-danger line-through')}
        </p>
      </div>
      <div className="rounded-sm bg-canvas-alt p-3">
        <p className="mb-1 text-xs font-medium text-text-tertiary">{t('diff_edited')}</p>
        <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-text">
          {render('del', 'rounded-xs bg-success-surface text-success')}
        </p>
      </div>
    </div>
  );
}

/** "You changed 12 words", counted over the title and the text. */
export function changedWordCount(original: DraftText, edited: DraftText): number {
  return wordsChanged(diffWords(original.title, edited.title)) + wordsChanged(diffWords(original.body, edited.body));
}

/**
 * The draft as a readable card: a small label for what it is, the title, the
 * text. It is plain text, escaped, so a link shows its address and nothing
 * loads by itself. When editing is allowed the same card turns into fields in
 * place, and once the text differs a hint says how much changed, with the
 * changes one tap away.
 */
export function InboxDraftCard({
  kindLabel,
  original,
  value,
  editing,
  editableTitle,
  editableBody,
  onChange,
  onSubmitShortcut,
}: {
  kindLabel: string;
  original: DraftText;
  value: DraftText;
  editing: boolean;
  editableTitle: boolean;
  editableBody: boolean;
  onChange: (next: DraftText) => void;
  /** Ctrl or Cmd with Enter inside a field. */
  onSubmitShortcut: () => void;
}) {
  const t = useTranslations('inbox_ui');
  const [showDiff, setShowDiff] = React.useState(false);
  const bodyField = React.useRef<HTMLTextAreaElement>(null);
  const titleField = React.useRef<HTMLInputElement>(null);
  // Turning on edit puts the caret in the text, which is what people came to change.
  React.useEffect(() => {
    if (!editing) return;
    (editableBody ? bodyField.current : titleField.current)?.focus();
  }, [editing, editableBody]);
  const changed = changedWordCount(original, value);
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onSubmitShortcut();
    }
  };

  return (
    <article className="rounded-md border border-border bg-surface p-4 shadow-xs sm:p-5">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-text-tertiary">{kindLabel}</p>
      {editing ? (
        <div className="space-y-3" onKeyDown={onKeyDown}>
          {editableTitle ? (
            <SNField label={t('field_title')}>
              <SNInput ref={titleField} value={value.title} maxLength={200} onChange={(e) => onChange({ ...value, title: e.target.value })} />
            </SNField>
          ) : (
            <h3 className="text-base font-semibold text-text">{value.title}</h3>
          )}
          {editableBody ? (
            <SNField label={t('field_text')}>
              <SNTextarea
                ref={bodyField}
                value={value.body}
                maxLength={20000}
                rows={9}
                onChange={(e) => onChange({ ...value, body: e.target.value })}
              />
            </SNField>
          ) : (
            <p className="whitespace-pre-wrap break-words text-sm text-text">{value.body}</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {value.title ? <h3 className="text-base font-semibold text-text">{value.title}</h3> : null}
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-text">{value.body}</p>
        </div>
      )}
      {editing && changed > 0 ? (
        <div className="mt-4 space-y-3 border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-text-secondary">
            <span className="inline-flex items-center gap-1.5">
              <Pencil aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
              {t('diff_hint', { count: changed })}
            </span>
            <SNButton variant="link" onClick={() => setShowDiff((current) => !current)}>
              {showDiff ? t('hide_changes') : t('show_changes')}
            </SNButton>
          </div>
          {showDiff ? <InboxDiff original={original.body} edited={value.body} /> : null}
        </div>
      ) : null}
    </article>
  );
}
