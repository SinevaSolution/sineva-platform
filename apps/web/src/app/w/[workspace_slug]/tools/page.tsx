import type { Metadata } from 'next';
import { ConnectionsCatalog } from '@/client/components/connections/connections_catalog';
import { toConnectionsRole } from '@/client/components/connections/connections_model';
import { getTranslations } from '@/i18n/server';
import { FILTER_CATEGORIES, type FilterCategory } from '@/shared/connections_view';
import { loadWorkspaceContext } from '../workspace_context';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('connections');
  return { title: t('title') };
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function ToolsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace_slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ workspace_slug }, raw] = await Promise.all([params, searchParams]);
  const ctx = await loadWorkspaceContext(workspace_slug);
  const category = first(raw.category);
  const connect = first(raw.connect);
  return (
    <ConnectionsCatalog
      workspaceId={ctx.workspace.id}
      workspaceSlug={ctx.workspace.slug}
      workspaceName={ctx.workspace.name}
      role={toConnectionsRole(ctx.workspace.role)}
      specialists={ctx.specialists}
      initialCategory={
        (FILTER_CATEGORIES as readonly string[]).includes(category ?? '') ? (category as FilterCategory) : null
      }
      initialQuery={(first(raw.q) ?? '').slice(0, 80)}
      initialConnect={connect && /^[a-z0-9_]{1,40}$/.test(connect) ? connect : null}
    />
  );
}
