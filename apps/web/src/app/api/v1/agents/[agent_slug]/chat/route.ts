import type { NextRequest } from 'next/server';
import { sendAgentChatDtoSchema } from '@/server/application/dtos/chat_dto';
import { getSendAgentMessageUseCase } from '@/server/container';
import {
  extractRequestId,
  handleRouteError,
  parseJsonBody,
  sendSuccessJson,
} from '@/server/http/response_helper';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ agent_slug: string }> },
) {
  try {
    const requestId = extractRequestId(request);
    const { agent_slug } = await context.params;
    const rawBody = await parseJsonBody(request);
    const validated = sendAgentChatDtoSchema.parse(rawBody);

    const responseData = await getSendAgentMessageUseCase().execute({
      agent_slug,
      session_id: validated.session_id,
      user_id: validated.user_id,
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
  } catch (error) {
    return handleRouteError(error, request);
  }
}
