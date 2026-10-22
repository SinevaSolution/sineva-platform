import { cookies } from 'next/headers';
import { AppShell } from '@/client/components/shell/app_shell';
import { parseSidebarCookie, SIDEBAR_COOKIE } from '@/client/components/shell/nav_model';
import { getGetPreferencesUseCase } from '@/server/container';
import { getPageSession } from '@/server/http/page_session';
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
  // `loadWorkspaceContext` already redirected a signed-out visitor, so the
  // session exists; the preference row is read once per request.
  const session = await getPageSession();
  const preferences = session ? await getGetPreferencesUseCase().execute(session.user_id) : null;
  // The cookie is the fast path and wins; the stored preference decides only
  // on a device that has no cookie yet.
  const collapsed =
    sidebarCookie !== undefined ? parseSidebarCookie(sidebarCookie) : (preferences?.sidebar_collapsed ?? false);

  return (
    <AppShell
      workspace={ctx.workspace}
      workspaces={ctx.workspaces}
      user={ctx.user}
      specialists={ctx.specialists}
      initialCollapsed={collapsed}
      storedTheme={preferences?.theme ?? 'system'}
    >
      {children}
    </AppShell>
  );
}
