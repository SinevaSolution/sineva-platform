import type { NextRequest } from 'next/server';
import {
  getCreateMessageUseCase,
  getListMessagesUseCase,
} from '@/server/container';
import {
  CreateMessageSchema,
  ListMessagesQuerySchema,
} from '@/server/application/dtos/conversation_dto';
import {
  handleRouteError,
  parseJsonBody,
  sendSuccessJson,
} from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

export const GET = withAuth<{ workspace_id: string; conversation_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const conversationId = params?.conversation_id ?? '';
      const { searchParams } = new URL(request.url);
      const queryParams: Record<string, string> = {};
      searchParams.forEach((val, key) => {
        queryParams[key] = val;
      });

      const validated = ListMessagesQuerySchema.parse(queryParams);
      const useCase = getListMessagesUseCase();
      const result = await useCase.execute(conversationId, validated, requestContext);

      return sendSuccessJson({
        data: result,
        message: 'Messages retrieved successfully.',
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

export const POST = withAuth<{ workspace_id: string; conversation_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const conversationId = params?.conversation_id ?? '';
      const rawBody = await parseJsonBody(request);
      const validated = CreateMessageSchema.parse(rawBody);

      const useCase = getCreateMessageUseCase();
      const result = await useCase.execute(conversationId, validated, requestContext);

      return sendSuccessJson({
        data: result,
        message: 'Message processed successfully.',
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
