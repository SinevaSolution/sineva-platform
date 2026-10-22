import { redirect } from 'next/navigation';
import { FirstWorkspace } from '@/client/components/onboarding/first_workspace';
import { AuthCard } from '@/client/components/auth/auth_card';
import { getListUserWorkspacesUseCase } from '@/server/container';
import { getPageSession } from '@/server/http/page_session';
import { getTranslations } from '@/i18n/server';
export default async function Page() {
  const session = await getPageSession();
  if (!session) redirect('/sign-in');
  const workspaces = await getListUserWorkspacesUseCase().execute({ user_id: session.user_id });
  if (workspaces[0]) redirect(`/w/${workspaces[0].workspace.workspace_slug}/onboarding`);
  const t = await getTranslations('onboarding_ui');
  return (
    <AuthCard scene="lineup" title={t('create_title')}>
      <FirstWorkspace />
    </AuthCard>
  );
}
