import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { PageHeader } from '@/client/components/shell/page_header';
import { ProfileForm } from '@/client/components/settings/profile_form';
import { getGetProfileUseCase, getListUserAccountsUseCase } from '@/server/container';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import { getTranslations } from '@/i18n/server';
import { getPageSession } from '@/server/http/page_session';
import type { ProfileView } from '@/shared/profile_view';
import { loadWorkspaceContext } from '../../workspace_context';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('account');
  return { title: t('profile.title') };
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ workspace_slug: string }>;
}) {
  const { workspace_slug } = await params;
  const t = await getTranslations('account');
  // Redirects to sign-in or 404s for a foreign workspace before anything else loads.
  await loadWorkspaceContext(workspace_slug);
  const session = await getPageSession();
  if (!session) {
    redirect('/sign-in');
  }

  let profile: ProfileView;
  try {
    profile = await getGetProfileUseCase().execute(session.user_id);
  } catch (err) {
    if (err instanceof NotFoundError) {
      notFound();
    }
    throw err;
  }
  const accounts = await getListUserAccountsUseCase().execute(session.user_id);

  return (
    <>
      <PageHeader title={t('profile.title')} />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-8">
        <div className="max-w-[640px]">
          <ProfileForm
            profile={profile}
            // The server validates against its own ICU data, so it supplies the list.
            timeZones={Intl.supportedValuesOf('timeZone')}
            linkedProviders={accounts.map((a) => a.provider)}
          />
        </div>
      </div>
    </>
  );
}
