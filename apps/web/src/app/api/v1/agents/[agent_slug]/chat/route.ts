import type { NextRequest } from 'next/server';
import { sendAgentChatDtoSchema } from '@/application/dtos/chat_dto';
import { SendAgentMessageUseCase } from '@/application/use-cases/send_agent_message_use_case';
import { defaultAgentRepository } from '@/infrastructure/database/client';
import { defaultAiEngineGateway } from '@/infrastructure/gateways/internal_ai_engine_gateway';
import {
  handleRouteError,
  sendSuccessJson,
} from '@/presentation/http/response_helper';

const sendAgentMessageUseCase = new SendAgentMessageUseCase(
  defaultAgentRepository,
  defaultAiEngineGateway,
);

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ agent_slug: string }> },
) {
  try {
    const { agent_slug } = await context.params;
    const rawBody: unknown = await request.json();
    const validated = sendAgentChatDtoSchema.parse(rawBody);

    const responseData = await sendAgentMessageUseCase.execute({
      agent_slug,
      session_id: validated.session_id,
      user_id: validated.user_id,
      message_text: validated.message_text,
      context_metadata: validated.context_metadata,
    });

    return sendSuccessJson({
      data: responseData,
      message: 'Agent companion message processed successfully',
      status: 200,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
