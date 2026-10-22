'use client';

import { InboxEmailAction } from './inbox_email_action';

import { ArrowLeft, Clock, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { SNBadge, SNBanner, SNButton, SNField, SNIconButton, SNTextarea, SNTooltip } from '@sineva/ui';
import { useTranslations } from '@/i18n/provider';
import type { InboxItemView } from '@/shared/inbox_view';
import { InboxAvatar } from './inbox_avatar';
import { InboxDiff, InboxDraftCard, type DraftText } from './inbox_draft_card';
import { expiryHint } from './inbox_model';
import { InboxQuestionForm, type Answers } from './inbox_question_form';
import type { InboxText } from './inbox_text';

/** What a person can ask the detail to do. The screen turns each into a call. */
export type DetailAction =
  | { type: 'approve'; edited?: Record<string, unknown> }
  | { type: 'reject'; note?: string }
  | { type: 'changes'; instruction: string }
  | { type: 'answer'; answers: Answers }
  | { type: 'skip' };

/** The keys of the screen reach the open item through these. */
export interface InboxDetailApi {
  approve(): void;
  edit(): void;
  reject(): void;
  changes(): void;
  /** Closes an open note or instruction field. False when there was none. */
  closePanel(): boolean;
}

type Panel = 'changes' | 'reject' | null;

const str = (value: unknown) => (typeof value === 'string' ? value : '');

export function InboxDetail({
  item,
  workspaceSlug,
  readOnly,
  currentUserId,
  text,
  busy,
  conflict,
  apiRef,
  onDecide,
  onBack,
  onNext,
}: {
  item: InboxItemView;
  workspaceSlug: string;
  readOnly: boolean;
  currentUserId: string;
  text: InboxText;
  busy: boolean;
  /** Someone else decided while this person was looking. */
  conflict: boolean;
  apiRef: React.MutableRefObject<InboxDetailApi | null>;
  /** Resolves true when the server took the decision. */
  onDecide: (action: DetailAction) => Promise<boolean>;
  onBack: () => void;
  /** Moves to the next item in the list, once this one is settled. */
  onNext: (() => void) | null;
}) {
  const t = useTranslations('inbox_ui');
  const tRoot = useTranslations('');
  const approval = item.approval;
  const input = item.input_request;
  const emailAction = approval?.action_type.startsWith('email.') ?? false;
  const approveLabel = approval?.action_type === 'email.send' ? t('email_action.send') : t('approve');
  const name = text.nameOf(item.agent_slug);

  const open = item.state === 'open';
  const pendingApproval = open && approval?.status === 'pending';
  const canDecide = !readOnly && pendingApproval && !approval?.awaiting_revision;
  const canAnswer = !readOnly && open && input?.status === 'pending';

  const original: DraftText = { title: str(item.payload?.title), body: str(item.payload?.body) };
  const editable = item.editable_fields ?? [];
  const editableTitle = editable.includes('title');
  const editableBody = editable.includes('body');
  const canEdit = canDecide && item.payload !== undefined && (editableTitle || editableBody);

  const [draft, setDraft] = React.useState<DraftText>(original);
  const [editing, setEditing] = React.useState(false);
  const [panel, setPanel] = React.useState<Panel>(null);
  const [note, setNote] = React.useState('');
  const [instruction, setInstruction] = React.useState('');
  const panelField = React.useRef<HTMLTextAreaElement>(null);
  const approveButton = React.useRef<HTMLButtonElement>(null);
  const rejectButton = React.useRef<HTMLButtonElement>(null);
  // Spoken when a key moves focus to a decision button, so the next Enter is not a surprise.
  const [announcement, setAnnouncement] = React.useState('');

  // Opening a panel moves the caret into its field so the next key types.
  React.useEffect(() => {
    if (panel) panelField.current?.focus();
  }, [panel]);

  const edited = editing && (draft.title !== original.title || draft.body !== original.body);

  const toggleEdit = () => {
    if (!canEdit || busy) return;
    setPanel(null);
    if (editing) setDraft(original);
    setEditing((current) => !current);
  };

  const approve = () => {
    if (!canDecide || busy) return;
    if (editing && editableBody && !draft.body.trim()) return;
    void onDecide({
      type: 'approve',
      ...(edited
        ? {
            edited: {
              ...item.payload,
              ...(editableTitle ? { title: draft.title } : {}),
              ...(editableBody ? { body: draft.body } : {}),
            },
          }
        : {}),
    });
  };
  const sendChanges = async () => {
    if (!canDecide || emailAction || busy || !instruction.trim()) return;
    if (await onDecide({ type: 'changes', instruction: instruction.trim() })) {
      setPanel(null);
      setInstruction('');
    }
  };
  const sendReject = async () => {
    if (!canDecide || busy) return;
    if (await onDecide({ type: 'reject', ...(note.trim() ? { note: note.trim() } : {}) })) {
      setPanel(null);
      setNote('');
    }
  };

  // The latest closures, handed to the screen's key handler on every render.
  React.useEffect(() => {
    apiRef.current = {
      // FR-INBOX-30: a key never decides. It moves focus to the button, and the
      // decision is the Enter or click that follows, like any button.
      approve: () => {
        if (!canDecide || busy) return;
        approveButton.current?.focus();
        setAnnouncement(t('press_enter_approve'));
      },
      edit: toggleEdit,
      reject: () => {
        if (!canDecide || busy) return;
        rejectButton.current?.focus();
        setAnnouncement(t('press_enter_reject'));
      },
      changes: () => {
        if (canDecide && !emailAction && !busy) setPanel('changes');
      },
      closePanel: () => {
        if (!panel) return false;
        setPanel(null);
        return true;
      },
    };
    return () => {
      apiRef.current = null;
    };
  });

  const chatHref = item.source.conversation_id ? `/w/${workspaceSlug}/chat/${item.source.conversation_id}` : null;
  const sourceLabel =
    item.source.type === 'chat' ? t('from_chat') : item.source.type === 'room' ? t('from_room') : t('from_system');
  const deadline = open ? expiryHint(item.expires_at, text.now) : null;
  const approveNote = item.approve_note_key && tRoot.has(item.approve_note_key) ? tRoot(item.approve_note_key) : null;

  return (
    <section aria-label={item.title} className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-5 px-4 py-4 sm:px-6 sm:py-6">
          <div className="flex items-center gap-3">
            <SNIconButton
              label={t('back_to_inbox')}
              shortcut="Esc"
              tooltipSide="bottom"
              onClick={onBack}
              className="-ms-2 lg:hidden"
            >
              <ArrowLeft aria-hidden="true" />
            </SNIconButton>
            <InboxAvatar slug={item.agent_slug} size={44} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-text">{name}</p>
              <p className="text-xs text-text-tertiary">
                {text.kindLabel(item.kind)} ·{' '}
                <time dateTime={item.created_at} title={text.exact(item.created_at)}>
                  {text.ago(item.created_at)}
                </time>
              </p>
            </div>
            {deadline ? (
              <SNBadge tone="warning" icon={<Clock aria-hidden="true" />}>
                {text.expiry(item.expires_at)}
              </SNBadge>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <h2 className="text-xl font-semibold leading-snug text-text">{item.title}</h2>
            <p className="text-sm text-text-secondary">{text.sentence(item)}</p>
            <p className="flex flex-wrap items-center gap-x-2 text-[13px] text-text-tertiary">
              <span>{sourceLabel}</span>
              {chatHref ? (
                <SNButton asChild variant="link">
                  <Link href={chatHref}>{t('open_chat')}</Link>
                </SNButton>
              ) : null}
            </p>
          </div>

          <Outcome
            item={item}
            text={text}
            currentUserId={currentUserId}
            conflict={conflict}
            chatHref={chatHref}
            readOnly={readOnly}
            onNext={onNext}
          />

          {approval && !readOnly && item.payload && approval.action_type.startsWith('email.') ? <InboxEmailAction payload={item.payload} /> : null}

          {approval && !readOnly && item.payload && !approval.action_type.startsWith('email.') ? (
            <InboxDraftCard
              kindLabel={t('draft_label', { kind: text.draftKind(str(item.payload.draft_kind)) })}
              original={original}
              value={draft}
              editing={editing}
              editableTitle={editableTitle}
              editableBody={editableBody}
              onChange={setDraft}
              onSubmitShortcut={approve}
            />
          ) : null}

          {input ? (
            <article className="space-y-4 rounded-md border border-border bg-surface p-4 shadow-xs sm:p-5">
              <p className="whitespace-pre-wrap break-words text-base font-medium text-text">{input.question}</p>
              {canAnswer ? (
                <InboxQuestionForm
                  fields={input.fields}
                  busy={busy}
                  onSend={(answers) => void onDecide({ type: 'answer', answers })}
                  onSkip={() => void onDecide({ type: 'skip' })}
                />
              ) : input.status === 'answered' && input.answer ? (
                <dl className="space-y-2 text-sm">
                  {input.fields.map((field) => {
                    const answer = input.answer?.[field.key];
                    if (answer === undefined) return null;
                    return (
                      <div key={field.key}>
                        <dt className="text-xs text-text-tertiary">{field.label}</dt>
                        <dd className="whitespace-pre-wrap break-words text-text">
                          {typeof answer === 'boolean' ? (answer ? t('yes') : t('no')) : String(answer)}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              ) : null}
            </article>
          ) : null}

          {canDecide ? (
            <div className="space-y-1">
              <p className="flex items-start gap-2 text-[13px] text-text-secondary">
                <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-text-brand" strokeWidth={1.75} />
                {t('reassure_approval')}
              </p>
              {approveNote ? <p className="ps-6 text-xs text-text-tertiary">{approveNote}</p> : null}
            </div>
          ) : canAnswer ? (
            <p className="flex items-start gap-2 text-[13px] text-text-secondary">
              <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-text-brand" strokeWidth={1.75} />
              {t('reassure_question', { name })}
            </p>
          ) : null}

          <EditedHint item={item} readOnly={readOnly} />

          {item.revisions && item.revisions.length > 1 && !readOnly ? (
            <details className="rounded-md border border-border px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-text">{t('earlier_versions')}</summary>
              <ul className="mt-3 space-y-3">
                {item.revisions.map((revision) => (
                  <li key={revision.revision} className="text-sm">
                    <p className="text-xs text-text-tertiary">
                      {revision.created_by === 'user' ? t('version_by_you', { number: revision.revision }) : t('version_by_sino', { number: revision.revision, name })}
                      {' · '}
                      {text.ago(revision.created_at)}
                    </p>
                    {revision.payload ? (
                      <p className="mt-1 whitespace-pre-wrap break-words text-text-secondary">{str(revision.payload.body)}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
      {canDecide ? (
        <div className="shrink-0 border-t border-border bg-surface px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
          <div className="mx-auto w-full max-w-2xl">
            {panel === 'changes' ? (
              <form
                className="mb-3 space-y-2 rounded-md bg-canvas-alt p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendChanges();
                }}
              >
                <SNField label={t('changes_label')} hint={t('changes_hint')}>
                  <SNTextarea
                    ref={panelField}
                    rows={2}
                    maxLength={1000}
                    value={instruction}
                    onChange={(event) => setInstruction(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                        event.preventDefault();
                        void sendChanges();
                      }
                    }}
                  />
                </SNField>
                <div className="flex gap-2">
                  <SNButton type="submit" variant="primary" loading={busy} disabled={!instruction.trim()}>
                    {t('send_request')}
                  </SNButton>
                  <SNButton variant="ghost" onClick={() => setPanel(null)}>
                    {t('cancel')}
                  </SNButton>
                </div>
              </form>
            ) : null}
            {panel === 'reject' ? (
              <form
                className="mb-3 space-y-2 rounded-md bg-canvas-alt p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendReject();
                }}
              >
                <SNField label={t('reject_label')} hint={t('reject_hint')}>
                  <SNTextarea
                    ref={panelField}
                    rows={2}
                    maxLength={1000}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                        event.preventDefault();
                        void sendReject();
                      }
                    }}
                  />
                </SNField>
                <div className="flex gap-2">
                  <SNButton type="submit" variant="danger" loading={busy}>
                    {emailAction ? t('email_action.reject') : t('reject_confirm')}
                  </SNButton>
                  <SNButton variant="ghost" onClick={() => setPanel(null)}>
                    {t('cancel')}
                  </SNButton>
                </div>
              </form>
            ) : null}
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <SNTooltip label={approveLabel} shortcut={t('shortcut_then_enter', { key: 'a' })}>
                <SNButton
                  ref={approveButton}
                  variant="primary"
                  size="lg"
                  loading={busy}
                  disabled={editing && editableBody && !draft.body.trim()}
                  onClick={approve}
                  className="col-span-2 sm:col-auto"
                >
                  {approveLabel}
                </SNButton>
              </SNTooltip>
              {canEdit ? (
                <SNTooltip label={editing ? t('discard_edits') : t('edit')} shortcut="e">
                  <SNButton
                    size="lg"
                    disabled={busy}
                    onClick={toggleEdit}
                  >
                    {editing ? t('discard_edits') : t('edit')}
                  </SNButton>
                </SNTooltip>
              ) : null}
              {!emailAction ? <SNTooltip label={t('changes')} shortcut="c">
                <SNButton size="lg" disabled={busy} onClick={() => setPanel('changes')}>
                  {t('changes')}
                </SNButton>
              </SNTooltip> : null}
              <SNTooltip label={t('reject')} shortcut={t('shortcut_then_enter', { key: 'r' })}>
                <SNButton ref={rejectButton} variant="ghost" size="lg" disabled={busy} onClick={() => setPanel('reject')}>
                  {t('reject')}
                </SNButton>
              </SNTooltip>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Where the item stands once it is not waiting for this person: who decided,
 * when, and what that did. It also covers the two cases that are not a plain
 * decision: someone else decided first, and a request for changes that is
 * waiting for a new draft.
 */
function Outcome({
  item,
  text,
  currentUserId,
  conflict,
  chatHref,
  readOnly,
  onNext,
}: {
  item: InboxItemView;
  text: InboxText;
  currentUserId: string;
  conflict: boolean;
  chatHref: string | null;
  readOnly: boolean;
  onNext: (() => void) | null;
}) {
  const t = useTranslations('inbox_ui');
  const approval = item.approval;
  const input = item.input_request;
  const name = text.nameOf(item.agent_slug);

  const next = onNext ? (
    <SNButton variant="link" onClick={onNext}>
      {t('next_item')}
    </SNButton>
  ) : undefined;

  if (approval?.status === 'pending' && approval.awaiting_revision) {
    return (
      <SNBanner tone="info" title={t('awaiting_new_draft', { name })}>
        {approval.change_request ? t('you_asked', { text: approval.change_request }) : null}
      </SNBanner>
    );
  }

  const expired = item.state === 'expired' || approval?.status === 'expired' || input?.status === 'expired';
  if (expired) {
    return (
      <SNBanner
        tone="warning"
        title={input ? t('result_expired_question') : t('result_expired_draft')}
        action={
          chatHref && !readOnly ? (
            <SNButton asChild variant="link">
              <Link href={chatHref}>{t('draft_again')}</Link>
            </SNButton>
          ) : undefined
        }
      >
        {t('expired_body')}
      </SNBanner>
    );
  }

  if (approval && (approval.status === 'approved' || approval.status === 'rejected')) {
    const you = approval.decided_by !== null && approval.decided_by === currentUserId;
    const who = approval.decided_by_name ?? t('someone');
    const approved = approval.status === 'approved';
    const emailAction = approval.action_type.startsWith("email.");
    const line = emailAction
      ? approved ? approval.action_type === "email.send" ? t("email_action.sent") : t("email_action.completed") : t("email_action.rejected")
      : approved
      ? you
        ? t('result_approved_you')
        : t('result_approved_other', { name: who })
      : you
        ? t('result_rejected_you')
        : t('result_rejected_other', { name: who });
    const when = approval.decided_at ? text.ago(approval.decided_at) : null;
    const after = emailAction ? approved ? t('email_action.after_completed') : t('email_action.after_rejected') : approved ? t('after_approved') : t('after_rejected', { name });
    if (conflict && !you) {
      return (
        <SNBanner tone="warning" title={t('conflict_title', { name: who })} action={next}>
          <Parts parts={[line, when, t('conflict_body')]} />
        </SNBanner>
      );
    }
    return (
      <SNBanner tone={approved ? 'success' : 'info'} title={line} action={next}>
        <Parts parts={[when, after]} />
      </SNBanner>
    );
  }

  if (input && (input.status === 'answered' || input.status === 'dismissed')) {
    const you = input.answered_by !== null && input.answered_by === currentUserId;
    const answered = input.status === 'answered';
    const line = answered
      ? you
        ? t('result_answered_you')
        : t('result_answered_other')
      : you
        ? t('result_skipped_you')
        : t('result_skipped_other');
    const when = input.answered_at ? text.ago(input.answered_at) : null;
    const after = answered ? t('after_answered', { name }) : t('after_skipped', { name });
    return (
      <SNBanner tone={answered ? 'success' : 'info'} title={line} action={next}>
        <Parts parts={[when, after]} />
      </SNBanner>
    );
  }

  if (approval?.status === 'cancelled') {
    return <SNBanner tone="info" title={t('result_cancelled')} />;
  }
  return null;
}

/** Short facts on one line, each in its own element so each can be found and read on its own. */
function Parts({ parts }: { parts: Array<string | null> }) {
  const shown = parts.filter((part): part is string => Boolean(part));
  return (
    <>
      {shown.map((part, index) => (
        <React.Fragment key={part}>
          {index > 0 ? <span aria-hidden="true"> · </span> : null}
          <span>{part}</span>
        </React.Fragment>
      ))}
    </>
  );
}

/** "Edited before it was approved", with the changes one tap away. */
function EditedHint({ item, readOnly }: { item: InboxItemView; readOnly: boolean }) {
  const t = useTranslations('inbox_ui');
  const [show, setShow] = React.useState(false);
  const revisions = item.revisions ?? [];
  const userRevision = [...revisions].reverse().find((r) => r.created_by === 'user' && r.payload);
  if (readOnly || item.approval?.status !== 'approved' || !userRevision?.payload) return null;
  const before = [...revisions]
    .filter((r) => r.created_by === 'specialist' && r.revision < userRevision.revision && r.payload)
    .pop();
  const originalBody = str(before?.payload?.body);
  const editedBody = str(userRevision.payload.body);
  return (
    <div className="space-y-2">
      <p className="flex flex-wrap items-center gap-x-3 text-[13px] text-text-secondary">
        {t('edited_before_approval')}
        {originalBody ? (
          <SNButton variant="link" onClick={() => setShow((current) => !current)}>
            {show ? t('hide_changes') : t('show_changes')}
          </SNButton>
        ) : null}
      </p>
      {show && originalBody ? <InboxDiff original={originalBody} edited={editedBody} /> : null}
    </div>
  );
}
