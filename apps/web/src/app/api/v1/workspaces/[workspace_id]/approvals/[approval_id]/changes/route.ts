import type { NextRequest } from 'next/server';
import { getRequestApprovalChangesUseCase } from '@/server/container';
import { RequestChangesSchema } from '@/server/application/dtos/inbox_dto';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { assertSessionOnly } from '@/server/http/session_only_guard';
import { withAuth } from '@/server/http/with_auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth<{ workspace_id: string; approval_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      assertSessionOnly(request);
      const body = RequestChangesSchema.parse(await parseJsonBody(request));
      const result = await getRequestApprovalChangesUseCase().execute(params?.approval_id ?? '', body, requestContext);
      return sendSuccessJson({
        data: result,
        message: 'Change request sent.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  {
    scope: 'workspace',
    permission: 'approval.decide_own',
  },
);
