import type { NextRequest } from 'next/server';
import { MemberProfileUpdateSchema } from '@/server/application/dtos/profile_dto';
import { getLeaveWorkspaceUseCase, getUpdateMemberProfileUseCase } from '@/server/container';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

// The caller edits their own row in the URL workspace. The guard has already
// matched the session's membership to the URL (a foreign workspace is a 404),
// and the user id comes from the session, so no member id exists to tamper with.
export const PATCH = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      const body = MemberProfileUpdateSchema.parse(await parseJsonBody(request));
      const member = await getUpdateMemberProfileUseCase().execute({
        user_id: requestContext.user_id,
        workspace_id: requestContext.workspace_id ?? '',
        ...body,
        context: requestContext,
      });
      return sendSuccessJson({
        data: { job_title: member.job_title, department: member.department },
        message: 'Member profile updated successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (err) {
      return handleRouteError(err, request);
    }
  },
  { scope: 'workspace', permission: 'profile.update' },
);

// Leaving affects only the caller's own row in the URL workspace. Every role
// may call it; the use case refuses the owner (ownership must move first).
export const DELETE = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      await getLeaveWorkspaceUseCase().execute({ context: requestContext });
      return sendSuccessJson({
        data: null,
        message: 'You left the workspace.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (err) {
      return handleRouteError(err, request);
    }
  },
  { scope: 'workspace', permission: 'workspace.view' },
);
