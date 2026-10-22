import { MembersScreen } from '@/client/components/members/members_screen';
import {
  getListMembersUseCase,
  getListInvitationsUseCase,
  getGetOwnershipTransferUseCase,
} from '@/server/container';
import { getWorkspacePageContext } from '@/server/http/page_context';
import { loadWorkspaceContext } from '../../workspace_context';
export default async function Page({ params }: { params: Promise<{ workspace_slug: string }> }) {
  const { workspace_slug } = await params;
  const ctx = await loadWorkspaceContext(workspace_slug);
  const context = await getWorkspacePageContext(ctx.workspace.id);
  const manager = context.role === 'owner' || context.role === 'admin';
  const [members, invitations, transfer] = await Promise.all([
    getListMembersUseCase().execute({ context }),
    manager ? getListInvitationsUseCase().execute({ context }) : Promise.resolve([]),
    context.role === 'owner'
      ? getGetOwnershipTransferUseCase().execute({ context })
      : Promise.resolve(null),
  ]);
  return (
    <MembersScreen
      workspaceId={ctx.workspace.id}
      role={context.role!}
      members={members}
      invitations={invitations}
      transfer={transfer}
      specialists={ctx.specialists}
    />
  );
}
