import { BusinessProfileScreen } from '@/client/components/onboarding/business_profile_screen';
import { getGetBusinessProfileUseCase, getListProfileVersionsUseCase } from '@/server/container';
import { getWorkspacePageContext } from '@/server/http/page_context';
import { loadWorkspaceContext } from '../../workspace_context';
export default async function Page({ params }: { params: Promise<{ workspace_slug: string }> }) {
  const { workspace_slug } = await params;
  const ctx = await loadWorkspaceContext(workspace_slug);
  const context = await getWorkspacePageContext(ctx.workspace.id);
  const canEdit = context.role === 'owner' || context.role === 'admin';
  const [result, versions] = await Promise.all([
    getGetBusinessProfileUseCase().execute({ workspace_id: ctx.workspace.id }),
    canEdit
      ? getListProfileVersionsUseCase().execute({ workspace_id: ctx.workspace.id, limit: 20 })
      : Promise.resolve([]),
  ]);
  return (
    <BusinessProfileScreen
      key={result.profile.version}
      workspaceId={ctx.workspace.id}
      workspaceSlug={workspace_slug}
      result={result}
      versions={versions}
      canEdit={canEdit}
    />
  );
}
