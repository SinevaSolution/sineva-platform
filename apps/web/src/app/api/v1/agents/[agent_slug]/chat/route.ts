import type { NextRequest } from 'next/server';
import { sendAgentChatDtoSchema } from '@/server/application/dtos/chat_dto';
import { getSendAgentMessageUseCase } from '@/server/container';
import {
  extractRequestId,
  parseJsonBody,
  sendSuccessJson,
} from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

export const POST = withAuth<{ agent_slug: string }>(
  async (request: NextRequest, { requestContext, params }) => {
    const requestId = extractRequestId(request);
    const agent_slug = params?.agent_slug ?? '';
    const rawBody = await parseJsonBody(request);
    const validated = sendAgentChatDtoSchema.parse(rawBody);

    const responseData = await getSendAgentMessageUseCase().execute({
      agent_slug,
      session_id: validated.session_id,
      user_id:
        requestContext.user_id !== 'anonymous'
          ? requestContext.user_id
          : validated.user_id,
      message_text: validated.message_text,
      context_metadata: validated.context_metadata,
      request_id: requestId,
    });

    return sendSuccessJson({
      data: responseData,
      message: 'Agent companion message processed successfully',
      status: 200,
      request_id: requestId,
    });
  },
  {
    scope: 'workspace',
    permission: 'chat.create',
    specialistSlugExtractor: (_req, params) => params?.agent_slug as string,
  },
);
