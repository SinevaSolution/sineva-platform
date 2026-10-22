import type { Metadata } from 'next';
import { ChatThread } from '@/client/components/chat/chat_thread';
import { getTranslations } from '@/i18n/server';
import { loadWorkspaceContext } from '../../workspace_context';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return { title: t('chat') };
}

export default async function ChatThreadPage({
  params,
}: {
  params: Promise<{ workspace_slug: string; conversation_id: string }>;
}) {
  const { workspace_slug, conversation_id } = await params;
  const ctx = await loadWorkspaceContext(workspace_slug);

  // `key` resets the thread state when moving between chats.
  return (
    <ChatThread
      key={conversation_id}
      workspaceId={ctx.workspace.id}
      workspaceSlug={workspace_slug}
      conversationId={conversation_id}
      specialists={ctx.specialists}
    />
  );
}
