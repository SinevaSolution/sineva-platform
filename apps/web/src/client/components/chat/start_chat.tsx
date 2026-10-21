'use client';

import { useRouter } from 'next/navigation';
import type * as React from 'react';
import { toast } from 'sonner';
import { ApiError, apiRequest } from '@/client/lib/api';
import { useAppDispatch } from '@/client/store/hooks';
import { chatsChanged } from '@/client/store/slices/ui_slice';
import type { ConversationView } from '@/shared/chat_view';
import type { ShellSpecialistView } from '@/shared/shell_view';
import { Composer, type ComposerHandle } from './composer';

/**
 * Composer that starts a new chat: creates the conversation, sends the first
 * message, then opens the chat page. With `agentSlug` it is a private chat
 * with that specialist; without it, a chat with Sino.
 */
export function StartChat({
  workspaceId,
  workspaceSlug,
  agentSlug,
  placeholder,
  specialists,
  onPendingChange,
  ref,
}: {
  ref?: React.Ref<ComposerHandle>;
  /** True while the chat is being created, so the room can show Sino at work. */
  onPendingChange?: (pending: boolean) => void;
  workspaceId: string;
  workspaceSlug: string;
  agentSlug?: string;
  placeholder: string;
  specialists?: ShellSpecialistView[];
}) {
  const router = useRouter();
  const dispatch = useAppDispatch();

  async function start(text: string): Promise<boolean> {
    onPendingChange?.(true);
    try {
      const conversation = await apiRequest<ConversationView>(
        `/api/v1/workspaces/${workspaceId}/conversations`,
        {
          method: 'POST',
          body: {
            kind: agentSlug ? 'room' : 'hub',
            agent_slug: agentSlug ?? null,
            title: text.slice(0, 80),
            title_source: 'first_message',
          },
        },
      );
      await apiRequest(
        `/api/v1/workspaces/${workspaceId}/conversations/${conversation.id}/messages`,
        { method: 'POST', body: { content: text, client_message_id: crypto.randomUUID() } },
      );
      dispatch(chatsChanged());
      router.push(`/w/${workspaceSlug}/chat/${conversation.id}`);
      return true;
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Something went wrong. Try again.');
      onPendingChange?.(false);
      return false;
    }
  }

  return <Composer
      ref={ref}
      onSubmit={start}
      placeholder={placeholder}
      size="lg"
      specialists={specialists}
      autoFocus
    />;
}
