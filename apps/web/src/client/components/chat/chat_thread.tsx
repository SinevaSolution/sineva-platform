'use client';

import * as React from 'react';
import { toast } from 'sonner';
import type { RoomMood } from '@/client/components/room/room_model';
import { RoomBubble, RoomStage } from '@/client/components/room/room_stage';
import { SinoFigure } from '@/client/components/ui/sino_figure';
import { specialistPose } from '@/client/components/ui/specialist_accent';
import { Button } from '@/client/components/ui/button';
import { apiRequest } from '@/client/lib/api';
import { useApiErrorText } from '@/client/lib/use_api_error';
import { useTranslations } from '@/i18n/provider';
import type { ConversationView, MessageView } from '@/shared/chat_view';
import type { ShellSpecialistView } from '@/shared/shell_view';
import { Composer } from './composer';

// The product name is a name, not copy: it is never translated.
const SINO_NAME = 'Sino';

type ThreadState =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; conversation: ConversationView; messages: MessageView[] };

export function ChatThread({
  workspaceId,
  conversationId,
  specialists,
}: {
  workspaceId: string;
  conversationId: string;
  specialists: ShellSpecialistView[];
}) {
  const t = useTranslations('chat');
  const tCommon = useTranslations('common');
  const errorText = useApiErrorText();
  const [state, setState] = React.useState<ThreadState>({ status: 'loading' });
  const [attempt, setAttempt] = React.useState(0);
  const [sendFailed, setSendFailed] = React.useState(false);
  const bottomRef = React.useRef<HTMLLIElement>(null);
  const base = `/api/v1/workspaces/${workspaceId}/conversations/${conversationId}`;

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
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messageCount]);

  async function send(text: string): Promise<boolean> {
    setSendFailed(false);
    try {
      const result = await apiRequest<{ message_id: string; status: string }>(`${base}/messages`, {
        method: 'POST',
        body: { content: text, client_message_id: crypto.randomUUID() },
      });
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
                  run_id: null,
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
      toast.error(errorText(error));
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
        <SinoFigure pose="confused" size={120} />
        <p className="max-w-sm text-sm text-fg-secondary">{errorText(state.error)}</p>
        <Button onClick={() => setAttempt((n) => n + 1)}>{tCommon('try_again')}</Button>
      </div>
    );
  }

  const { conversation, messages } = state;
  const specialist = conversation.agent_slug
    ? specialists.find((s) => s.agent_slug === conversation.agent_slug)
    : undefined;
  const companionName = specialist?.display_name ?? 'Sino';
  const lastIsUser = messages.at(-1)?.role === 'user';
  const isTeam = conversation.kind !== 'room';
  // Replies are not live yet, so after a send Sino gives a thumbs up ("got
  // it") rather than pretending to work on an answer.
  const mood: RoomMood = sendFailed ? 'error' : lastIsUser ? 'done' : 'idle';

  const header = (
    <div className="flex items-center gap-2 px-4 pb-2 pt-3 sm:px-6">
      <SinoFigure pose={specialistPose(specialist?.agent_slug ?? 'sino')} size={34} />
      <div className="min-w-0">
        <h1 className="truncate text-[15px] font-semibold text-white">
          {conversation.title?.trim() || t('thread.title_default', { name: companionName })}
        </h1>
        <p className="text-xs text-white/65">{isTeam ? t('thread.subtitle_team') : t('thread.subtitle_private', { name: companionName })}</p>
      </div>
    </div>
  );

  const footer = (
    <div className="px-4 pb-4 pt-2 sm:px-6">
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
        {lastIsUser ? (
          <li className="anim-rise text-[13px] text-white/75">
            {t('thread.sent_note', { name: companionName })}
          </li>
        ) : null}
        <li ref={bottomRef} aria-hidden="true" />
      </ol>
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
  if (message.role === 'user') {
    return (
      <li className="anim-rise flex">
        <RoomBubble from="user">{message.content}</RoomBubble>
      </li>
    );
  }
  const slug = message.agent_slug ?? fallbackSlug ?? 'sino';
  const name = specialists.find((s) => s.agent_slug === slug)?.display_name ?? 'Sino';
  return (
    <li className="anim-rise flex items-end gap-2">
      <SinoFigure pose={specialistPose(slug)} size={32} />
      <RoomBubble from="companion">
        <span className="block text-xs font-semibold text-fg-brand">{name}</span>
        {/* Plain text until the sanitized markdown renderer lands (M1). */}
        {message.content}
      </RoomBubble>
    </li>
  );
}
