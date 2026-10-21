import type { Metadata } from 'next';
import { HomeView } from '@/client/components/home/home_view';
import { loadWorkspaceContext } from './workspace_context';

export const metadata: Metadata = { title: 'Home' };

function hourIn(timezone: string): number {
  try {
    return Number(
      new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: timezone }).format(new Date()),
    );
  } catch {
    return new Date().getHours();
  }
}

export default async function WorkspaceHomePage({
  params,
}: {
  params: Promise<{ workspace_slug: string }>;
}) {
  const { workspace_slug } = await params;
  const ctx = await loadWorkspaceContext(workspace_slug);
  const firstName = ctx.user.name.trim().split(/\s+/)[0] || 'there';

  return (
    <HomeView
      workspaceId={ctx.workspace.id}
      workspaceSlug={ctx.workspace.slug}
      firstName={firstName}
      specialists={ctx.specialists}
      hour={hourIn(ctx.workspace.timezone)}
    />
  );
}
