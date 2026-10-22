import type { Metadata } from 'next';
import { NewChatView } from '@/client/components/room/new_chat_view';
import { getTranslations } from '@/i18n/server';
import { getGetLibraryKnowledgeUseCase } from '@/server/container';
import { getWorkspacePageContext } from '@/server/http/page_context';
import { loadWorkspaceContext } from '../workspace_context';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return { title: t('new_chat') };
}

export default async function NewChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace_slug: string }>;
  searchParams: Promise<{ with?: string; prompt?: string }>;
}) {
  const [{ workspace_slug }, { with: withSlug, prompt }] = await Promise.all([params, searchParams]);
  const ctx = await loadWorkspaceContext(workspace_slug);
  const t = await getTranslations('workspace');
  const knowledge = await getGetLibraryKnowledgeUseCase().execute(await getWorkspacePageContext(ctx.workspace.id));
  // An unknown ?with= falls back to the team chat instead of a 404.
  const initialWith = ctx.specialists.some((s) => s.agent_slug === withSlug) ? (withSlug ?? null) : null;

  return (
    <NewChatView
      workspaceId={ctx.workspace.id}
      workspaceSlug={ctx.workspace.slug}
      firstName={ctx.user.name.trim().split(/\s+/)[0] || t('fallback_name')}
      specialists={ctx.specialists}
      initialWith={initialWith}
      knowledge={knowledge}
      initialPrompt={prompt?.slice(0, 500) ?? null}
    />
  );
}
