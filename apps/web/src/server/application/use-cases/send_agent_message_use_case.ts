import { NotFoundError } from '@/server/domain/errors/domain_error';
import type { AgentRepository } from '@/server/domain/repositories/agent_repository';
import type {
  AiEngineChatRequest,
  AiEngineChatResponse,
  AiEngineGateway,
} from '@/server/domain/repositories/ai_engine_gateway';

export class SendAgentMessageUseCase {
  constructor(
    private readonly agentRepository: AgentRepository,
    private readonly aiEngineGateway: AiEngineGateway,
  ) {}

  async execute(request: AiEngineChatRequest): Promise<AiEngineChatResponse> {
    const agent = await this.agentRepository.findBySlug(request.agent_slug);
    if (!agent) {
      throw new NotFoundError('Agent', request.agent_slug);
    }

    return this.aiEngineGateway.dispatchAgentChat(request);
  }
}
