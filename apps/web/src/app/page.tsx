import { redirect } from 'next/navigation';
import { getListUserWorkspacesUseCase } from '@/server/container';
import { getPageSession } from '@/server/http/page_session';

export const dynamic = 'force-dynamic';

// Entry point: signed-out people go to sign-in, everyone else to their first
// workspace. Accounts without a workspace enter the creation flow.
export default async function RootPage() {
  const session = await getPageSession();
  if (!session) {
    redirect('/sign-in');
  }
  const memberships = await getListUserWorkspacesUseCase().execute({ user_id: session.user_id });
  const first = memberships[0];
  if (!first) redirect('/onboarding');
  redirect(`/w/${first.workspace.workspace_slug}`);
}
