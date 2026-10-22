import type { Metadata } from 'next';
import { SettingsHub } from '@/client/components/settings/settings_hub';
import { businessProfileCompleteness } from '@/client/components/settings/settings_nav_model';
import {
  getGetBusinessProfileUseCase,
  getGetOnboardingUseCase,
  getListMembersUseCase,
} from '@/server/container';
import { getWorkspacePageContext } from '@/server/http/page_context';
import { getTranslations } from '@/i18n/server';
import { loadWorkspaceContext } from '../workspace_context';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings_ui');
  return { title: t('title') };
}

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ workspace_slug: string }>;
}) {
  const { workspace_slug } = await params;
  const ctx = await loadWorkspaceContext(workspace_slug);
  const context = await getWorkspacePageContext(ctx.workspace.id);
  // Three cheap reads for the card hints; each is already tenant-scoped.
  const [members, business, onboarding] = await Promise.all([
    getListMembersUseCase().execute({ context }),
    getGetBusinessProfileUseCase().execute({ workspace_id: ctx.workspace.id }),
    getGetOnboardingUseCase().execute({
      workspace_id: ctx.workspace.id,
      user_id: context.user_id,
      role: context.role!,
    }),
  ]);
  return (
    <SettingsHub
      workspaceSlug={workspace_slug}
      workspaceName={ctx.workspace.name}
      role={ctx.workspace.role}
      userName={ctx.user.name}
      userEmail={ctx.user.email}
      emailVerified={context.email_verified === true}
      membersCount={members.length}
      profileCompleteness={businessProfileCompleteness(business.profile)}
      resumeSetup={onboarding.state.status !== 'completed'}
    />
  );
}
