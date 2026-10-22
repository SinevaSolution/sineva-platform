'use client';

import { Square } from 'lucide-react';
import * as React from 'react';
import { SNButton, snToast, SNTooltip } from '@sineva/ui';
import { LibraryKnowsChip } from '@/client/components/library/library_knows_chip';
import { ConversationActions } from '@/client/components/conversation/conversation_actions';
import { InlineTitleEdit } from '@/client/components/conversation/inline_title_edit';
import { useConversationActions } from '@/client/components/conversation/use_conversation_actions';
import { RoomBubble, RoomStage } from '@/client/components/room/room_stage';
import { SNSinoFigure } from '@/client/components/ui/sn_sino_figure';
import { specialistPose } from '@/client/components/ui/specialist_accent';
import { apiRequest } from '@/client/lib/api';
import { openRunStream, type RunDoneResult, type RunStreamEvent, type RunStreamHandle } from '@/client/lib/event_stream';
import { streamErrorText } from '@/client/lib/stream_errors';
import { useApiErrorText } from '@/client/lib/use_api_error';
import { useTranslations } from '@/i18n/provider';
import type {
  ConversationView,
  MessageCardView,
  MessageView,
  SendMessageResultView,
} from '@/shared/chat_view';
import type { LibraryKnowledgeView } from '@/shared/library_view';
import type { ShellSpecialistView } from '@/shared/shell_view';
import { Composer } from './composer';
import { MessageCards } from './message_cards';
import {
  liveCardFromFrame,
  moodForLive,
  pendingRunToAttach,
  reduceLiveReply,
  type LiveReply,
} from './live_reply_model';
import { splitMentions } from './mention_segments';

const IDLE: LiveReply = { phase: 'idle' };

const FINAL_STATUSES: ReadonlyArray<MessageView['status']> = [
  'completed',
  'failed',
  'needs_approval',
  'needs_input',
  'budget_exceeded',
  'cancelled',
];

function assistantFromDone(
  result: RunDoneResult,
  runId: string,
  conversationId: string,
  cards: MessageCardView[],
): MessageView {
  const cancelled = result.finish_reason === 'cancelled';
  const status = cancelled
    ? 'cancelled'
    : FINAL_STATUSES.find((s) => s === result.status) ?? 'completed';
  const now = new Date().toISOString();
  return {
    id: `live-${runId}`,
    conversation_id: conversationId,
    role: 'assistant',
    agent_slug: result.routed_agent_slug || result.agent_slug || null,
    content: result.reply_content,
    mentions: null,
    status,
    finish_reason: result.finish_reason,
    run_id: runId,
    channel: 'web',
    client_message_id: null,
    cards,
    created_at: now,
    updated_at: now,
  };
}

// The product name is a name, not copy: it is never translated.
const SINO_NAME = 'Sino';

type ThreadState =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; conversation: ConversationView; messages: MessageView[] };

export function ChatThread({
  workspaceId,
  workspaceSlug,
  conversationId,
  specialists,
  knowledge,
}: {
  workspaceId: string;
  workspaceSlug: string;
  conversationId: string;
  specialists: ShellSpecialistView[];
  /** What Sino and each specialist can use from the Library ("Knows N documents"). */
  knowledge: LibraryKnowledgeView;
}) {
  const t = useTranslations('chat');
  const tCommon = useTranslations('common');
  const tConversation = useTranslations('conversation');
  // Empty namespace: stream error keys are full catalog paths (`chat.error.*`).
  const tFull = useTranslations('');
  const errorText = useApiErrorText();
  const [state, setState] = React.useState<ThreadState>({ status: 'loading' });
  const [attempt, setAttempt] = React.useState(0);
  const [sendFailed, setSendFailed] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const actions = useConversationActions({ workspaceId, workspaceSlug });
  const [live, dispatchLive] = React.useReducer(reduceLiveReply, IDLE);
  const bottomRef = React.useRef<HTMLLIElement>(null);
  const streamRef = React.useRef<RunStreamHandle | null>(null);
  // Cards that finished while the reply streams. The ref is what the done
  // handler reads (it runs inside a stream callback); the state is what renders.
  const liveCardsRef = React.useRef<MessageCardView[]>([]);
  const [liveCards, setLiveCards] = React.useState<MessageCardView[]>([]);
  // Which load already looked for a run to attach to (see the effect below).
  const autoAttachKey = React.useRef<string | null>(null);
  const base = `/api/v1/workspaces/${workspaceId}/conversations/${conversationId}`;

  // Leaving the chat only stops listening; the reply keeps being stored on the server.
  React.useEffect(
    () => () => {
      streamRef.current?.close();
      streamRef.current = null;
      autoAttachKey.current = null;
    },
    [],
  );

  function attach(runId: string) {
    streamRef.current?.close();
    liveCardsRef.current = [];
    dispatchLive({ type: 'start', run_id: runId });
    streamRef.current = openRunStream({
      workspaceId,
      runId,
      onEvent: (event: RunStreamEvent) => {
        if (event.type === 'token') {
          dispatchLive({ type: 'token', token: event.token });
        } else if (event.type === 'other' && event.event === 'card_completed') {
          const card = liveCardFromFrame(event.data, runId, liveCardsRef.current.length);
          if (card) {
            liveCardsRef.current = [...liveCardsRef.current, card];
            setLiveCards(liveCardsRef.current);
          }
        } else if (event.type === 'done') {
          const reply = assistantFromDone(event.result, runId, conversationId, liveCardsRef.current);
          setState((prev) =>
            prev.status !== 'ready' || (!reply.content && (reply.cards ?? []).length === 0)
              ? prev
              : { ...prev, messages: [...prev.messages, reply] },
          );
          // The stored reply now carries the cards; the live bubble goes away.
          liveCardsRef.current = [];
          setLiveCards([]);
          dispatchLive({ type: 'done', cancelled: reply.status === 'cancelled' });
        } else if (event.type === 'error') {
          liveCardsRef.current = [];
          setLiveCards([]);
          dispatchLive({ type: 'error', code: event.code, retryable: event.retryable });
        }
      },
    });
  }

  // A chat opens in one of two situations that need a stream: it was just
  // created (the first message is waiting for its reply), or the page was
  // reloaded mid-reply. Both look the same: the last message is the person's
  // and has no reply. Once per load, so a failed attach is not retried by
  // re-renders; Retry is the person's call.
  React.useEffect(() => {
    if (state.status !== 'ready') return;
    const key = `${conversationId}:${attempt}`;
    if (autoAttachKey.current === key) return;
    autoAttachKey.current = key;
    const runId = pendingRunToAttach(state.messages, Date.now());
    if (runId) attach(runId);
    // `attach` only closes over stable values and refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, attempt, conversationId]);

  React.useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiRequest<ConversationView>(base),
      apiRequest<{ items: MessageView[] }>(`${base}/messages`),
    ])
      .then(([conversation, page]) => {
        if (cancelled) return;
        const messages = [...page.items].sort((a, b) => a.created_at.localeCompare(b.created_at));
        setState({ status: 'ready', conversation, messages });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({ status: 'error', error });
      });
    return () => {
      cancelled = true;
    };
  }, [base, attempt]);

  const messageCount = state.status === 'ready' ? state.messages.length : 0;
  const liveLength = live.phase === 'streaming' || live.phase === 'error' ? live.text.length : 0;
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messageCount, liveLength, live.phase]);

  async function stop() {
    if (live.phase !== 'streaming' || live.stopping) return;
    dispatchLive({ type: 'stopping' });
    try {
      // The stream then ends with the partial text kept (done, cancelled).
      await apiRequest(`/api/v1/workspaces/${workspaceId}/runs/${live.run_id}/cancel`, { method: 'POST' });
    } catch {
      dispatchLive({ type: 'stop_failed' });
      snToast.error(t('thread.stop_failed'));
    }
  }

  function retry() {
    if (live.phase !== 'error' || state.status !== 'ready') return;
    if (live.retry === 'same_run') {
      // Nothing was produced yet: attach to the same run again.
      attach(live.run_id);
      return;
    }
    // The run is over: send the same words again as a new message.
    const lastUser = [...state.messages].reverse().find((m) => m.role === 'user');
    dispatchLive({ type: 'reset' });
    if (lastUser) void send(lastUser.content);
  }

  async function send(text: string): Promise<boolean> {
    if (live.phase === 'streaming') {
      snToast.info(t('thread.still_replying', { name: companionName }));
      return false;
    }
    setSendFailed(false);
    try {
      const result = await apiRequest<SendMessageResultView>(`${base}/messages`, {
        method: 'POST',
        body: { content: text, client_message_id: crypto.randomUUID() },
      });
      // Reply: open the stream right away; the room switches to working.
      attach(result.run_id);
      setState((prev) =>
        prev.status !== 'ready'
          ? prev
          : {
              ...prev,
              messages: [
                ...prev.messages,
                {
                  id: result.message_id,
                  conversation_id: conversationId,
                  role: 'user',
                  agent_slug: null,
                  content: text,
                  mentions: null,
                  status: 'completed',
                  finish_reason: null,
                  run_id: result.run_id,
                  channel: 'web',
                  client_message_id: null,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
              ],
            },
      );
      return true;
    } catch (error) {
      setSendFailed(true);
      snToast.error(errorText(error));
      return false;
    }
  }

  if (state.status === 'loading') {
    return (
      <RoomStage slug={null} mood="idle" label={SINO_NAME}>
        <div className="flex-1" aria-busy="true" aria-label={t('thread.loading')} />
      </RoomStage>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <SNSinoFigure pose="confused" size={120} />
        <p className="max-w-sm text-sm text-text-secondary">{errorText(state.error)}</p>
        <SNButton size="sm" onClick={() => setAttempt((n) => n + 1)}>
          {tCommon('try_again')}
        </SNButton>
      </div>
    );
  }

  const { conversation, messages } = state;
  const specialist = conversation.agent_slug
    ? specialists.find((s) => s.agent_slug === conversation.agent_slug)
    : undefined;
  const companionName = specialist?.display_name ?? 'Sino';
  const isTeam = conversation.kind !== 'room';
  // Working while a reply streams, thumbs up when it lands, confused on error.
  const mood = moodForLive(live, sendFailed);
  const announcement =
    live.phase === 'done'
      ? t('thread.announce_replied', { name: companionName })
      : live.phase === 'stopped'
        ? t('thread.announce_stopped')
        : live.phase === 'error'
          ? streamErrorText(tFull, live.code, companionName)
          : '';

  const displayTitle = conversation.title?.trim() || t('thread.title_default', { name: companionName });
  const setTitle = (title: string | null) =>
    setState((prev) =>
      prev.status !== 'ready' ? prev : { ...prev, conversation: { ...prev.conversation, title } },
    );

  const header = (
    <div className="flex items-center gap-2 px-4 pb-2 pt-3 sm:px-6">
      <SNSinoFigure pose={specialistPose(specialist?.agent_slug ?? 'sino')} size={34} />
      <div className="min-w-0">
        {renaming ? (
          <InlineTitleEdit
            value={conversation.title}
            label={tConversation('rename_label')}
            className="h-7 w-full min-w-[12rem] text-[15px] font-semibold"
            onCancel={() => setRenaming(false)}
            onSave={(next) => {
              setRenaming(false);
              void actions.rename(conversation.id, next, {
                previous: conversation.title,
                apply: setTitle,
              });
            }}
          />
        ) : (
          <h1 className="truncate text-[15px] font-semibold text-text-inverse">{displayTitle}</h1>
        )}
        <p className="text-xs text-text-inverse/65">{isTeam ? t('thread.subtitle_team') : t('thread.subtitle_private', { name: companionName })}</p>
      </div>
      <div className="ms-auto hidden sm:block">
        <LibraryKnowsChip
          workspaceSlug={workspaceSlug}
          knowledge={knowledge}
          agentSlug={isTeam ? null : (specialist?.agent_slug ?? null)}
          name={companionName}
        />
      </div>
      {renaming ? null : (
        <ConversationActions
          title={displayTitle}
          triggerClassName="size-8 text-text-inverse/75 hover:bg-text-inverse/15 hover:text-text-inverse data-[state=open]:bg-text-inverse/15 data-[state=open]:text-text-inverse"
          onRename={() => setRenaming(true)}
          onDelete={() => actions.remove(conversation.id)}
        />
      )}
    </div>
  );

  const footer = (
    <div className="px-4 pb-4 pt-2 sm:px-6">
      {live.phase === 'streaming' ? (
        <div className="mb-2 flex justify-center">
          <SNTooltip label={t('thread.stop_tooltip')} side="top">
            <SNButton
              size="lg"
              onClick={() => void stop()}
              aria-disabled={live.stopping}
              aria-label={t('thread.stop_tooltip')}
              // `!` makes the translucent surface win over the variant's solid one
              // deterministically; without tailwind-merge two bg utilities on one
              // element are ordered by the stylesheet, not by this string.
              className="bg-surface/90! backdrop-blur-md"
            >
              <Square aria-hidden="true" fill="currentColor" />
              {live.stopping ? t('thread.stopping') : t('thread.stop')}
            </SNButton>
          </SNTooltip>
        </div>
      ) : null}
      <Composer
        onSubmit={send}
        placeholder={isTeam ? t('thread.placeholder_team') : t('thread.placeholder_specialist', { name: companionName })}
        specialists={isTeam ? specialists : undefined}
      />
    </div>
  );

  return (
    <RoomStage
      slug={specialist?.agent_slug ?? null}
      mood={mood}
      label={isTeam ? t('thread.stage_team') : companionName}
      header={header}
      footer={footer}
    >
      <ol className="flex min-h-full flex-col justify-end gap-3 px-4 py-6 sm:px-6" aria-label={t('thread.messages_label')} role="log">
        {messages.map((m) => (
          <MessageRow key={m.id} message={m} specialists={specialists} fallbackSlug={specialist?.agent_slug} />
        ))}
        {live.phase === 'streaming' ? (
          // Tokens arrive many times a second; the log region must not read
          // each one out, so this row opts out and completion is announced
          // once in the status line below.
          <li className="anim-rise flex items-end gap-2" aria-live="off" aria-busy="true">
            <SNSinoFigure pose={specialistPose(specialist?.agent_slug ?? 'sino')} size={32} />
            <RoomBubble from="companion">
              <span className="block text-xs font-semibold text-text-brand">{companionName}</span>
              {/* Plain text on purpose: model output is never rendered as HTML. */}
              {live.text || <span className="text-text-secondary">{t('thread.working', { name: companionName })}</span>}
              <MessageCards cards={liveCards} />
            </RoomBubble>
          </li>
        ) : null}
        {live.phase === 'error' ? (
          <li className="anim-rise flex flex-col items-start gap-2">
            {live.text ? (
              <div className="flex items-end gap-2">
                <SNSinoFigure pose={specialistPose(specialist?.agent_slug ?? 'sino')} size={32} />
                <RoomBubble from="companion">
                  <span className="block text-xs font-semibold text-text-brand">{companionName}</span>
                  {live.text}
                </RoomBubble>
              </div>
            ) : null}
            <RoomBubble from="companion">
              <span className="block">{streamErrorText(tFull, live.code, companionName)}</span>
              <SNButton size="sm" variant="primary" onClick={retry} className="mt-2">
                {tCommon('try_again')}
              </SNButton>
            </RoomBubble>
          </li>
        ) : null}
        <li ref={bottomRef} aria-hidden="true" />
      </ol>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </RoomStage>
  );
}

function MessageRow({
  message,
  specialists,
  fallbackSlug,
}: {
  message: MessageView;
  specialists: ShellSpecialistView[];
  fallbackSlug?: string;
}) {
  const t = useTranslations('chat');
  // Empty namespace: stream error keys are full catalog paths (`chat.error.*`).
  const tFull = useTranslations('');
  if (message.role === 'user') {
    return (
      <li className="anim-rise flex">
        <RoomBubble from="user">
          {splitMentions(
            message.content,
            specialists.map((sp) => sp.display_name),
          ).map((seg, i) =>
            seg.mention ? (
              <span key={i} className="rounded-xs bg-text-inverse/20 shadow-[0_0_0_2px_color-mix(in_srgb,var(--color-text-inverse)_20%,transparent)]">
                {seg.text}
              </span>
            ) : (
              <React.Fragment key={i}>{seg.text}</React.Fragment>
            ),
          )}
        </RoomBubble>
      </li>
    );
  }
  const slug = message.agent_slug ?? fallbackSlug ?? 'sino';
  const name = specialists.find((s) => s.agent_slug === slug)?.display_name ?? 'Sino';
  return (
    <li className="anim-rise flex items-end gap-2">
      <SNSinoFigure pose={specialistPose(slug)} size={32} />
      <RoomBubble from="companion">
        <span className="block text-xs font-semibold text-text-brand">{name}</span>
        {/* Plain text until the sanitized markdown renderer lands (M1). */}
        {message.content}
        <MessageCards cards={message.cards} />
        {message.status === 'error' ? (
          <span className="mt-1 block text-[13px] text-text-secondary">
            {streamErrorText(tFull, message.finish_reason ?? 'upstream_interrupted', name)}
          </span>
        ) : null}
        {message.status === 'cancelled' ? (
          <span className="mt-1 block text-[13px] text-text-secondary">{t('thread.you_stopped')}</span>
        ) : null}
      </RoomBubble>
    </li>
  );
}
