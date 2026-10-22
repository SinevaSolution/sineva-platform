'use client';

import * as React from 'react';
import { SNButton, SNCheckbox, SNField, SNInput, SNSegmented, SNSelect } from '@sineva/ui';
import { useTranslations } from '@/i18n/provider';
import type { InboxInputFieldView } from '@/shared/inbox_view';

export type Answers = Record<string, unknown>;

// Up to this many choices fit on one line as a segmented control and cost one
// tap; more than that is a list.
const SEGMENTED_MAX = 3;

/** A required field with nothing in it, or a number that is not one, blocks Send. */
export function answersComplete(fields: readonly InboxInputFieldView[], answers: Answers): boolean {
  return fields.every((field) => {
    const value = answers[field.key];
    if (field.type === 'boolean') return !field.required || value !== undefined;
    if (field.type === 'number') return value === undefined ? !field.required : Number.isFinite(value);
    return !field.required || (typeof value === 'string' && value.trim() !== '');
  });
}

/**
 * The fields of a question, one control each: text and numbers are inputs, a
 * short list of choices is a segmented control and a longer one a select, a
 * yes or no that must be answered is a segmented control and an optional one
 * is a checkbox.
 */
export function InboxQuestionForm({
  fields,
  busy,
  onSend,
  onSkip,
}: {
  fields: readonly InboxInputFieldView[];
  busy: boolean;
  onSend: (answers: Answers) => void;
  onSkip: () => void;
}) {
  const t = useTranslations('inbox_ui');
  const [answers, setAnswers] = React.useState<Answers>(() =>
    // An optional yes or no starts as "no", so leaving the box empty is an answer.
    Object.fromEntries(fields.filter((f) => f.type === 'boolean' && !f.required).map((f) => [f.key, false])),
  );
  const baseId = React.useId();
  const set = (key: string, value: unknown) => setAnswers((current) => ({ ...current, [key]: value }));
  const clear = (key: string) =>
    setAnswers((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  const complete = answersComplete(fields, answers);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (complete && !busy) onSend(answers);
      }}
    >
      {fields.map((field) => {
        const labelId = `${baseId}-${field.key}`;
        const label = (
          <span id={labelId} className="mb-1.5 block text-sm font-medium text-text">
            {field.label}
            {field.required ? <span aria-hidden="true"> *</span> : null}
          </span>
        );
        if (field.type === 'boolean' && !field.required) {
          return (
            <SNCheckbox
              key={field.key}
              label={field.label}
              checked={answers[field.key] === true}
              onCheckedChange={(checked) => set(field.key, checked)}
            />
          );
        }
        if (field.type === 'boolean') {
          return (
            <div key={field.key}>
              {label}
              <SNSegmented
                aria-labelledby={labelId}
                value={answers[field.key] === undefined ? '' : String(answers[field.key])}
                onValueChange={(value) => set(field.key, value === 'true')}
                options={[
                  { value: 'true', label: t('yes') },
                  { value: 'false', label: t('no') },
                ]}
              />
            </div>
          );
        }
        if (field.type === 'choice') {
          const choices = field.choices ?? [];
          if (choices.length <= SEGMENTED_MAX) {
            return (
              <div key={field.key}>
                {label}
                <SNSegmented
                  aria-labelledby={labelId}
                  value={typeof answers[field.key] === 'string' ? (answers[field.key] as string) : ''}
                  onValueChange={(value) => set(field.key, value)}
                  options={choices.map((choice) => ({ value: choice, label: choice }))}
                />
              </div>
            );
          }
          return (
            <SNField key={field.key} label={field.label} required={field.required}>
              <SNSelect
                value={typeof answers[field.key] === 'string' ? (answers[field.key] as string) : ''}
                onValueChange={(value) => set(field.key, value)}
                placeholder={t('choose')}
                options={choices.map((choice) => ({ value: choice, label: choice }))}
              />
            </SNField>
          );
        }
        return (
          <SNField key={field.key} label={field.label} required={field.required}>
            <SNInput
              type={field.type === 'number' ? 'number' : 'text'}
              inputMode={field.type === 'number' ? 'decimal' : undefined}
              value={answers[field.key] === undefined ? '' : String(answers[field.key])}
              maxLength={field.type === 'number' ? undefined : 4000}
              onChange={(event) => {
                const raw = event.target.value;
                if (raw === '') clear(field.key);
                else set(field.key, field.type === 'number' ? Number(raw) : raw);
              }}
            />
          </SNField>
        );
      })}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <SNButton type="submit" variant="primary" size="lg" loading={busy} disabled={!complete}>
          {t('send')}
        </SNButton>
        <SNButton variant="ghost" size="lg" disabled={busy} onClick={onSkip}>
          {t('skip_question')}
        </SNButton>
      </div>
    </form>
  );
}
