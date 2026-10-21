import type { Metadata } from 'next';
import { NewChatView } from '@/client/components/room/new_chat_view';
import { loadWorkspaceContext } from '../workspace_context';

export const metadata: Metadata = { title: 'New chat' };

export default async function NewChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace_slug: string }>;
  searchParams: Promise<{ with?: string; prompt?: string }>;
}) {
  const [{ workspace_slug }, { with: withSlug, prompt }] = await Promise.all([params, searchParams]);
  const ctx = await loadWorkspaceContext(workspace_slug);
  // An unknown ?with= falls back to the team chat instead of a 404.
  const initialWith = ctx.specialists.some((s) => s.agent_slug === withSlug) ? (withSlug ?? null) : null;

  return (
    <NewChatView
      workspaceId={ctx.workspace.id}
      workspaceSlug={ctx.workspace.slug}
      firstName={ctx.user.name.trim().split(/\s+/)[0] || 'there'}
      specialists={ctx.specialists}
      initialWith={initialWith}
      initialPrompt={prompt?.slice(0, 500) ?? null}
    />
  );
}
