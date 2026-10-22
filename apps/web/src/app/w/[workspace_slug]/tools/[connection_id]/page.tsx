import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ConnectionDetail } from '@/client/components/connections/connection_detail';
import { getTranslations } from '@/i18n/server';
import { loadWorkspaceContext } from '../../workspace_context';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('connections');
  return { title: t('title') };
}

// A connection id is always a UUID; anything else is a 404 before any lookup.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ConnectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace_slug: string; connection_id: string }>;
  searchParams: Promise<{ reconnect?: string }>;
}) {
  const [{ workspace_slug, connection_id }, { reconnect }] = await Promise.all([params, searchParams]);
  if (!UUID.test(connection_id)) notFound();
  const ctx = await loadWorkspaceContext(workspace_slug);
  return (
    <ConnectionDetail
      workspaceId={ctx.workspace.id}
      workspaceSlug={ctx.workspace.slug}
      workspaceName={ctx.workspace.name}
      connectionId={connection_id}
      specialists={ctx.specialists}
      initialReconnect={reconnect === '1'}
    />
  );
}
