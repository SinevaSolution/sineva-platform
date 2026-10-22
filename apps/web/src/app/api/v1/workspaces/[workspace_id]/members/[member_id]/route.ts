import type { NextRequest } from 'next/server';
import { IdParamSchema, UpdateMemberSchema } from '@/server/application/dtos/member_dto';
import {
  getGetMemberUseCase,
  getRemoveMemberUseCase,
  getUpdateMemberUseCase,
} from '@/server/container';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

type Params = { workspace_id: string; member_id: string };

export const GET = withAuth<Params>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const member = await getGetMemberUseCase().execute({
        context: requestContext,
        member_id: IdParamSchema.parse(params?.member_id),
      });
      return sendSuccessJson({
        data: member,
        message: 'Member retrieved successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'member.view' },
);

// The guard admits owner and admin (member.update_access); the use case then
// applies the finer rules (an admin cannot touch another admin or the owner).
export const PATCH = withAuth<Params>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const memberId = IdParamSchema.parse(params?.member_id);
      const body = UpdateMemberSchema.parse(await parseJsonBody(request));
      const member = await getUpdateMemberUseCase().execute({
        context: requestContext,
        member_id: memberId,
        ...body,
      });
      return sendSuccessJson({
        data: member,
        message: 'Member updated successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'member.update_access' },
);

// Removal is a sensitive action: a fresh session is required (FR-AUTH-06).
export const DELETE = withAuth<Params>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      await getRemoveMemberUseCase().execute({
        context: requestContext,
        member_id: IdParamSchema.parse(params?.member_id),
      });
      return sendSuccessJson({
        data: null,
        message: 'Member removed successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'member.remove', requireFreshSession: true },
);
