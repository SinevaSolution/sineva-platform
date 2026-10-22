import type { NextRequest } from 'next/server';
import {
  getDeleteConversationUseCase,
  getGetConversationUseCase,
  getRenameConversationUseCase,
} from '@/server/container';
import { RenameConversationSchema } from '@/server/application/dtos/conversation_dto';
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

export const PATCH = withAuth<{ workspace_id: string; conversation_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const conversationId = params?.conversation_id ?? '';
      const rawBody = await parseJsonBody(request);
      const validated = RenameConversationSchema.parse(rawBody);

      const useCase = getRenameConversationUseCase();
      const conversation = await useCase.execute(conversationId, validated, requestContext);

      return sendSuccessJson({
        data: conversation,
        message: 'Conversation renamed successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  {
    scope: 'workspace',
    permission: 'chat.create',
  },
);

export const DELETE = withAuth<{ workspace_id: string; conversation_id: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const conversationId = params?.conversation_id ?? '';
      const useCase = getDeleteConversationUseCase();
      await useCase.execute(conversationId, requestContext);

      return sendSuccessJson({
        data: { id: conversationId, deleted: true },
        message: 'Conversation deleted successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  {
    scope: 'workspace',
    permission: 'chat.delete',
  },
);
