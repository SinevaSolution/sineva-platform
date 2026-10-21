import { cookies } from 'next/headers';
import { AppShell } from '@/client/components/shell/app_shell';
import { parseSidebarCookie, SIDEBAR_COOKIE } from '@/client/components/shell/nav_model';
import { loadWorkspaceContext } from './workspace_context';

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspace_slug: string }>;
}) {
  const { workspace_slug } = await params;
  const ctx = await loadWorkspaceContext(workspace_slug);
  const sidebarCookie = (await cookies()).get(SIDEBAR_COOKIE)?.value;

  return (
    <AppShell
      workspace={ctx.workspace}
      workspaces={ctx.workspaces}
      user={ctx.user}
      specialists={ctx.specialists}
      initialCollapsed={parseSidebarCookie(sidebarCookie)}
    >
      {children}
    </AppShell>
  );
}
