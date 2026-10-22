import 'server-only';
import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { getListUserWorkspacesUseCase } from '@/server/container';
import { getLocale } from '@/i18n/server';
import { getPageSession } from '@/server/http/page_session';
import { localizeSpecialists } from '@/shared/specialists/manifest';
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

  const [memberships, locale] = await Promise.all([
    getListUserWorkspacesUseCase().execute({ user_id: session.user_id }),
    getLocale(),
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
    // Presentation comes from the static manifest on purpose: the shell must keep
    // working when sineva-ai is down. Availability is the roster route's job
    // (ADR-0024).
    specialists: localizeSpecialists(locale),
  };
});
