import type { NextRequest } from 'next/server';
import { getDecideApprovalUseCase } from '@/server/container';
import { DecideApprovalSchema } from '@/server/application/dtos/inbox_dto';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { assertSessionOnly } from '@/server/http/session_only_guard';
import { withAuth } from '@/server/http/with_auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// `approval.decide_own` is the gate for owner, admin and member; the use case
// narrows a member to items addressed to them and lets owner and admin decide
// any (`approval.decide_any`).
export const POST = withAuth<{ workspace_id: string; approval_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      assertSessionOnly(request);
      const body = DecideApprovalSchema.parse(await parseJsonBody(request));
      const result = await getDecideApprovalUseCase().execute(params?.approval_id ?? '', body, requestContext);
      return sendSuccessJson({
        data: result,
        message: 'Decision recorded.',
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
