import { redirect } from 'next/navigation';
import { getListUserWorkspacesUseCase } from '@/server/container';
import { getTranslations } from '@/i18n/server';
import { getPageSession } from '@/server/http/page_session';

export const dynamic = 'force-dynamic';

// Entry point: signed-out people go to sign-in, everyone else to their first
// workspace. Workspace creation (onboarding) is not built yet.
export default async function RootPage() {
  const session = await getPageSession();
  if (!session) {
    redirect('/sign-in');
  }
  const memberships = await getListUserWorkspacesUseCase().execute({ user_id: session.user_id });
  const first = memberships[0];
  if (!first) {
    const t = await getTranslations('workspace');
    return (
      <main className="flex min-h-dvh items-center justify-center p-6 text-center">
        <div className="max-w-sm">
          <h1 className="text-lg font-semibold">{t('no_workspace.title')}</h1>
          <p className="mt-2 text-sm text-text-secondary">{t('no_workspace.body')}</p>
        </div>
      </main>
    );
  }
  redirect(`/w/${first.workspace.workspace_slug}`);
}
