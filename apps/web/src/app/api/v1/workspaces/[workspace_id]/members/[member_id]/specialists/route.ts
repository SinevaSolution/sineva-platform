import type { NextRequest } from 'next/server';
import { IdParamSchema, SetMemberSpecialistsSchema } from '@/server/application/dtos/member_dto';
import { getSetMemberSpecialistsUseCase } from '@/server/container';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

// Replaces the allowlist and makes the scope `selected` (FR-AUTH-19).
export const PUT = withAuth<{ workspace_id: string; member_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const memberId = IdParamSchema.parse(params?.member_id);
      const body = SetMemberSpecialistsSchema.parse(await parseJsonBody(request));
      const member = await getSetMemberSpecialistsUseCase().execute({
        context: requestContext,
        member_id: memberId,
        specialist_slugs: body.specialist_slugs,
      });
      return sendSuccessJson({
        data: member,
        message: 'Specialist access updated successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'member.update_access' },
);
