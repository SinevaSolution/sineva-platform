import type { NextRequest } from 'next/server';
import { getAnswerInputRequestUseCase } from '@/server/container';
import { AnswerInputSchema } from '@/server/application/dtos/inbox_dto';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { assertSessionOnly } from '@/server/http/session_only_guard';
import { withAuth } from '@/server/http/with_auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth<{ workspace_id: string; item_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      assertSessionOnly(request);
      const body = AnswerInputSchema.parse(await parseJsonBody(request));
      const result = await getAnswerInputRequestUseCase().execute(params?.item_id ?? '', body, requestContext);
      return sendSuccessJson({
        data: result,
        message: 'Answer sent.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  {
    scope: 'workspace',
    permission: 'inbox.answer',
  },
);
