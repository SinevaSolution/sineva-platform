import { MembersScreen } from '@/client/components/members/members_screen';
import {
  getListMembersUseCase,
  getListInvitationsUseCase,
  getGetOwnershipTransferUseCase,
} from '@/server/container';
import { getWorkspacePageContext } from '@/server/http/page_context';
import { getPageSession } from '@/server/http/page_session';
import { reauthMethodsOf } from '@/shared/sign_in_methods_view';
import { loadWorkspaceContext } from '../../workspace_context';
import { loadSignInMethods } from '@/server/http/sign_in_methods';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ workspace_slug: string }>;
  searchParams: Promise<{ oauth?: string | string[] }>;
}) {
  const { workspace_slug } = await params;
  const notice = (await searchParams).oauth;
  const ctx = await loadWorkspaceContext(workspace_slug);
  const context = await getWorkspacePageContext(ctx.workspace.id);
  const session = await getPageSession();
  const manager = context.role === 'owner' || context.role === 'admin';
  const [members, invitations, transfer, methods] = await Promise.all([
    getListMembersUseCase().execute({ context }),
    manager ? getListInvitationsUseCase().execute({ context }) : Promise.resolve([]),
    context.role === 'owner'
      ? getGetOwnershipTransferUseCase().execute({ context })
      : Promise.resolve(null),
    // Only the sensitive actions (remove, transfer) need to know how to re-confirm.
    session && manager ? loadSignInMethods(session) : Promise.resolve(null),
  ]);
  return (
    <MembersScreen
      workspaceId={ctx.workspace.id}
      role={context.role!}
      members={members}
      invitations={invitations}
      transfer={transfer}
      specialists={ctx.specialists}
      reauthMethods={methods ? reauthMethodsOf(methods) : undefined}
      initialNotice={typeof notice === 'string' ? notice : undefined}
    />
  );
}
