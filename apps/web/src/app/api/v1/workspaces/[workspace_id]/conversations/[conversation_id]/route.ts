import type { NextRequest } from 'next/server';
import { getGetConversationUseCase } from '@/server/container';
import {
  handleRouteError,
  sendSuccessJson,
} from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

export const GET = withAuth<{ workspace_id: string; conversation_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const conversationId = params?.conversation_id ?? '';
      const useCase = getGetConversationUseCase();
      const conversation = await useCase.execute(conversationId, requestContext);

      return sendSuccessJson({
        data: conversation,
        message: 'Conversation retrieved successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  {
    scope: 'workspace',
    permission: 'chat.view_own',
  },
);
