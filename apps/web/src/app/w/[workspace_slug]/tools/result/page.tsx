import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ConnectResult } from '@/client/components/connections/connect_result';
import { parseResultQuery } from '@/client/components/connections/connections_model';
import { getTranslations } from '@/i18n/server';
import { loadWorkspaceContext } from '../../workspace_context';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('connections');
  return { title: t('title') };
}

// Same-site landing after the provider redirects back. Reads three short
// codes and nothing else; an address without a valid status is a 404.
export default async function ConnectResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace_slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ workspace_slug }, raw] = await Promise.all([params, searchParams]);
  const query = parseResultQuery(raw);
  if (!query) notFound();
  const ctx = await loadWorkspaceContext(workspace_slug);
  return (
    <ConnectResult
      query={query}
      workspaceId={ctx.workspace.id}
      workspaceSlug={ctx.workspace.slug}
      workspaceName={ctx.workspace.name}
      specialists={ctx.specialists}
    />
  );
}
