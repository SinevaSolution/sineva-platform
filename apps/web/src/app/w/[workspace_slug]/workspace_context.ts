import 'server-only';
import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { getGetAgentsUseCase, getListUserWorkspacesUseCase } from '@/server/container';
import { getPageSession } from '@/server/http/page_session';
import type {
  ShellSpecialistView,
  ShellUserView,
  ShellWorkspaceView,
} from '@/shared/shell_view';

export interface WorkspaceContext {
  user: ShellUserView;
  workspace: ShellWorkspaceView & { timezone: string };
  workspaces: ShellWorkspaceView[];
  specialists: ShellSpecialistView[];
}

/**
 * Everything the workspace layout and its pages need, resolved once per
 * request (React `cache`). Redirects to sign-in without a session and 404s
 * for a workspace the person is not a member of, so another tenant's slug
 * reveals nothing.
 */
export const loadWorkspaceContext = cache(async (workspaceSlug: string): Promise<WorkspaceContext> => {
  const session = await getPageSession();
  if (!session) {
    redirect('/sign-in');
  }

  const [memberships, agents] = await Promise.all([
    getListUserWorkspacesUseCase().execute({ user_id: session.user_id }),
    getGetAgentsUseCase().execute({ page: 1, per_page: 50 }),
  ]);

  const workspaces: ShellWorkspaceView[] = memberships.map(({ workspace, role }) => ({
    id: workspace.id,
    slug: workspace.workspace_slug,
    name: workspace.workspace_name,
    role,
  }));
  const current = memberships.find((m) => m.workspace.workspace_slug === workspaceSlug);
  if (!current) {
    notFound();
  }

  return {
    user: { name: session.name, email: session.email },
    workspace: {
      id: current.workspace.id,
      slug: current.workspace.workspace_slug,
      name: current.workspace.workspace_name,
      role: current.role,
      timezone: current.workspace.timezone,
    },
    workspaces,
    specialists: agents.items.map((a) => ({
      agent_slug: a.agent_slug,
      display_name: a.display_name,
      role_title: a.role_title,
      short_description: a.short_description,
    })),
  };
});
