'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SNBanner, SNButton, SNField, SNInput, SNSelect, SNTextarea } from '@sineva/ui';
import { formatDate } from '@sineva/ui/format';
import { ApiError, apiRequest } from '@/client/lib/api';
import { useApiErrorText } from '@/client/lib/use_api_error';
import { useLocale, useTranslations } from '@/i18n/provider';
import type { InboxItemView } from '@/shared/inbox_view';

export function InboxDetail({
  item,
  workspaceId,
  workspaceSlug,
  readOnly,
}: {
  item: InboxItemView;
  workspaceId: string;
  workspaceSlug: string;
  readOnly: boolean;
}) {
  const t = useTranslations('inbox_ui');
  const locale = useLocale();
  const errorText = useApiErrorText();
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [draftTitle, setDraftTitle] = React.useState(String(item.payload?.title ?? ''));
  const [draftBody, setDraftBody] = React.useState(String(item.payload?.body ?? ''));
  const [note, setNote] = React.useState('');
  const [instruction, setInstruction] = React.useState('');
  const [answers, setAnswers] = React.useState<Record<string, unknown>>({});
  const base = `/api/v1/workspaces/${workspaceId}`;
  const approval = item.approval;
  const input = item.input_request;
  const canDecide =
    !readOnly &&
    item.state === 'open' &&
    approval?.status === 'pending' &&
    !approval.awaiting_revision;
  const canAnswer = !readOnly && item.state === 'open' && input?.status === 'pending';
  async function mutate(path: string, body?: unknown) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await apiRequest(`${base}/${path}`, {
        method: 'POST',
        ...(body !== undefined ? { body } : {}),
      });
      router.refresh();
    } catch (err) {
      setError(errorText(err));
      if (err instanceof ApiError && err.status === 409) router.refresh();
    } finally {
      setPending(false);
    }
  }
  function decide(decision: 'approve' | 'reject') {
    if (!approval) return;
    void mutate(`approvals/${approval.id}/decision`, {
      version: approval.version,
      decision,
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(decision === 'approve' && editing
        ? { edited_payload: { ...item.payload, title: draftTitle, body: draftBody } }
        : {}),
    });
  }
  return (
    <article className="space-y-5 rounded-md border border-border p-5">
      <header>
        <h2 className="text-xl font-semibold">{item.title}</h2>
        <p className="mt-1 text-sm text-text-secondary">{formatDate(item.created_at, locale)}</p>
      </header>
      {item.unread ? (
        <SNButton size="sm" disabled={pending} onClick={() => mutate(`inbox/${item.id}/read`)}>
          {t('mark_read')}
        </SNButton>
      ) : null}
      {error ? <SNBanner tone="danger">{error}</SNBanner> : null}
      {item.payload ? (
        <div className="space-y-3">
          {editing ? (
            <>
              <SNField label={t('draft_title')}>
                <SNInput
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  maxLength={200}
                />
              </SNField>
              <SNField label={t('draft_body')}>
                <SNTextarea
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  maxLength={20000}
                  rows={8}
                />
              </SNField>
            </>
          ) : (
            <>
              <h3 className="font-medium">{String(item.payload.title ?? '')}</h3>
              <p className="whitespace-pre-wrap break-words text-sm">
                {String(item.payload.body ?? '')}
              </p>
            </>
          )}
        </div>
      ) : null}
      {approval ? (
        <>
          <SNBanner>{t('draft_only')}</SNBanner>
          {approval.awaiting_revision ? (
            <p role="status" className="text-sm text-text-secondary">
              {t('awaiting_revision')}
            </p>
          ) : null}
          {approval.decided_by_name ? (
            <p className="text-sm text-text-secondary">
              {t('decided_by', { name: approval.decided_by_name })}
            </p>
          ) : null}
        </>
      ) : null}
      {canDecide ? (
        <div className="space-y-4">
          {item.editable_fields?.includes('body') ? (
            <SNButton disabled={pending} onClick={() => setEditing(!editing)}>
              {editing ? t('cancel_edit') : t('edit')}
            </SNButton>
          ) : null}
          <SNField label={t('private_note')}>
            <SNTextarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              rows={2}
            />
          </SNField>
          <div className="sticky bottom-0 flex flex-wrap gap-2 border-t border-border bg-surface py-3">
            <SNButton
              variant="primary"
              loading={pending}
              disabled={editing && !draftBody.trim()}
              onClick={() => decide('approve')}
            >
              {t('approve')}
            </SNButton>
            <SNButton variant="secondary" disabled={pending} onClick={() => decide('reject')}>
              {t('reject')}
            </SNButton>
          </div>
          <form
            className="space-y-3 border-t border-border pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              void mutate(`approvals/${approval.id}/changes`, {
                version: approval.version,
                instruction,
              });
            }}
          >
            <SNField label={t('change_instruction')} required>
              <SNTextarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                maxLength={1000}
                required
                rows={3}
              />
            </SNField>
            <SNButton type="submit" disabled={pending || !instruction.trim()}>
              {t('request_changes')}
            </SNButton>
          </form>
        </div>
      ) : null}
      {input ? (
        <div className="space-y-4">
          <p className="whitespace-pre-wrap text-sm">{input.question}</p>
          {canAnswer ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void mutate(`inbox/${item.id}/answer`, { version: input.version, answers });
              }}
            >
              {input.fields.map((field) =>
                field.type === 'boolean' ? (
                  <SNField key={field.key} label={field.label} required={field.required}>
                    <SNSelect
                      value={answers[field.key] === undefined ? '' : String(answers[field.key])}
                      onValueChange={(value) =>
                        setAnswers({ ...answers, [field.key]: value === 'true' })
                      }
                      options={[
                        { value: 'true', label: t('yes') },
                        { value: 'false', label: t('no') },
                      ]}
                      required={field.required}
                    />
                  </SNField>
                ) : (
                  <SNField key={field.key} label={field.label} required={field.required}>
                    {field.type === 'choice' ? (
                      <SNSelect
                        value={String(answers[field.key] ?? '')}
                        onValueChange={(value) => setAnswers({ ...answers, [field.key]: value })}
                        options={(field.choices ?? []).map((value) => ({ value, label: value }))}
                        required={field.required}
                      />
                    ) : (
                      <SNInput
                        type={field.type === 'number' ? 'number' : 'text'}
                        value={String(answers[field.key] ?? '')}
                        onChange={(e) =>
                          setAnswers((current) => {
                            const next = { ...current };
                            if (!e.target.value) delete next[field.key];
                            else
                              next[field.key] =
                                field.type === 'number' ? Number(e.target.value) : e.target.value;
                            return next;
                          })
                        }
                        required={field.required}
                        maxLength={4000}
                      />
                    )}
                  </SNField>
                ),
              )}
              <div className="flex flex-wrap gap-2">
                <SNButton type="submit" variant="primary" loading={pending}>
                  {t('send_answer')}
                </SNButton>
                <SNButton disabled={pending} onClick={() => mutate(`inbox/${item.id}/dismiss`)}>
                  {t('dismiss')}
                </SNButton>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}
      {item.source.id && item.source.type !== 'system' ? (
        <SNButton asChild variant="link">
          <Link href={`/w/${workspaceSlug}/chat/${item.source.id}`}>{t('open_chat')}</Link>
        </SNButton>
      ) : null}
      {item.revisions && item.revisions.length > 0 ? (
        <details className="border-t border-border pt-4">
          <summary className="cursor-pointer text-sm font-medium">{t('revisions')}</summary>
          <ul className="mt-3 space-y-3">
            {item.revisions.map((revision) => (
              <li key={revision.revision} className="text-sm">
                <p className="text-text-secondary">
                  {t('revision', { number: revision.revision })} ·{' '}
                  {formatDate(revision.created_at, locale)}
                </p>
                {revision.payload ? (
                  <p className="whitespace-pre-wrap">{String(revision.payload.body ?? '')}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}
