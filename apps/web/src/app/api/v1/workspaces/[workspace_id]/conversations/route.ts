import type { NextRequest } from 'next/server';
import {
  getCreateConversationUseCase,
  getListConversationsUseCase,
} from '@/server/container';
import {
  CreateConversationSchema,
  ListConversationsQuerySchema,
} from '@/server/application/dtos/conversation_dto';
import {
  handleRouteError,
  parseJsonBody,
  sendSuccessJson,
} from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

export const GET = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      const { searchParams } = new URL(request.url);
      const queryParams: Record<string, string> = {};
      searchParams.forEach((val, key) => {
        queryParams[key] = val;
      });

      const validated = ListConversationsQuerySchema.parse(queryParams);
      const useCase = getListConversationsUseCase();
      const result = await useCase.execute(validated, requestContext);

      return sendSuccessJson({
        data: result,
        message: 'Conversations retrieved successfully.',
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

export const POST = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      const rawBody = await parseJsonBody(request);
      const validated = CreateConversationSchema.parse(rawBody);

      const useCase = getCreateConversationUseCase();
      const conversation = await useCase.execute(validated, requestContext);

      return sendSuccessJson({
        data: conversation,
        message: 'Conversation created successfully.',
        request_id: requestContext.request_id,
        status: 201,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  {
    scope: 'workspace',
    permission: 'chat.send',
  },
);
