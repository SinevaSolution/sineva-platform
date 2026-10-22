import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { PreferencesForm } from '@/client/components/settings/preferences_form';
import { ProfileForm } from '@/client/components/settings/profile_form';
import { SettingsPageHeader } from '@/client/components/settings/settings_page_header';
import { parseSettingsTab } from '@/client/components/settings/settings_tabs';
import { SignInMethods } from '@/client/components/settings/sign_in_methods';
import { getGetMeUseCase, getGetPreferencesUseCase } from '@/server/container';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import { getTranslations } from '@/i18n/server';
import { getPageSession } from '@/server/http/page_session';
import { loadWorkspaceContext } from '../../workspace_context';
import { loadSignInMethods } from '@/server/http/sign_in_methods';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings_ui');
  return { title: t('title') };
}

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace_slug: string }>;
  searchParams: Promise<{ tab?: string | string[]; oauth?: string | string[] }>;
}) {
  const { workspace_slug } = await params;
  const query = await searchParams;
  const tab = parseSettingsTab(query.tab);
  const t = await getTranslations('settings_ui');
  // Redirects to sign-in or 404s for a foreign workspace before anything else loads.
  const ctx = await loadWorkspaceContext(workspace_slug);
  const session = await getPageSession();
  if (!session) {
    redirect('/sign-in');
  }

  // Literal keys on purpose: the unused-key check reads them as written.
  const header =
    tab === 'preferences'
      ? { title: t('items.preferences.label'), description: t('items.preferences.description') }
      : tab === 'sign_in'
        ? { title: t('items.sign_in.label'), description: t('items.sign_in.description') }
        : { title: t('items.profile.label'), description: t('items.profile.description') };
  let content: React.ReactNode;
  if (tab === 'preferences') {
    content = <PreferencesForm initial={await getGetPreferencesUseCase().execute(session.user_id)} />;
  } else if (tab === 'sign_in') {
    content = (
      <SignInMethods
        view={await loadSignInMethods(session)}
        workspaceSlug={workspace_slug}
        initialNotice={typeof query.oauth === 'string' ? query.oauth : undefined}
      />
    );
  } else {
    let me;
    try {
      me = await getGetMeUseCase().execute(session.user_id);
    } catch (err) {
      if (err instanceof NotFoundError) {
        notFound();
      }
      throw err;
    }
    const membership = me.memberships.find((m) => m.workspace_id === ctx.workspace.id);
    content = (
      <ProfileForm
        profile={me.profile}
        member={{ job_title: membership?.job_title ?? null, department: membership?.department ?? null }}
        workspace={{ id: ctx.workspace.id, name: ctx.workspace.name, role: ctx.workspace.role }}
        // The server validates against its own ICU data, so it supplies the list.
        timeZones={Intl.supportedValuesOf('timeZone')}
      />
    );
  }

  return (
    <>
      <SettingsPageHeader title={header.title} description={header.description} />
      {content}
    </>
  );
}
