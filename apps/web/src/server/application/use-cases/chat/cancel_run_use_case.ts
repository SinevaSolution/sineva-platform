import type { AuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { ContextSigner } from '@/server/domain/context/signed_context';
import type { AiEngineGateway } from '@/server/domain/repositories/ai_engine_gateway';
import type { ChatRunRepository } from '@/server/domain/repositories/chat_run_repository';
import type { ConversationRepository } from '@/server/domain/repositories/conversation_repository';
import type { MessageRepository } from '@/server/domain/repositories/message_repository';
import type { RunHub } from '@/server/application/chat/run_hub';
import { resolveOwnedRun } from '@/server/application/chat/resolve_owned_run';
import { isTerminalRunStatus } from '@/server/domain/entities/chat_run';
import { DomainError } from '@/server/domain/errors/domain_error';

export interface CancelRunDeps {
  conversations: ConversationRepository;
  messages: MessageRepository;
  chatRuns: ChatRunRepository;
  gateway: AiEngineGateway;
  contextSigner: ContextSigner;
  hub: RunHub;
  audit: AuditLogger;
}

export interface CancelRunResult {
  run_id: string;
  status: string;
}

export class CancelRunUseCase {
  constructor(private readonly deps: CancelRunDeps) {}

  async execute(runHandle: string, context: RequestContext): Promise<CancelRunResult> {
    // Same ownership proof as the stream: a foreign handle is a plain 404.
    const { conversation } = await resolveOwnedRun(this.deps, runHandle, context);
    const run = await this.deps.chatRuns.findByHandle(runHandle);
    if (!run) {
      // Nothing was ever attached, so there is nothing running to stop.
      return { run_id: runHandle, status: 'pending' };
    }
    if (isTerminalRunStatus(run.status)) {
      return { run_id: runHandle, status: run.status };
    }

    await this.deps.audit.log({
      action: 'chat.run.cancel_requested',
      context,
      target_resource_type: 'chat_run',
      target_resource_id: run.id,
      metadata: { conversation_id: conversation.id },
    });

    if (run.status === 'pending') {
      // No upstream stream exists yet; make sure a later attach cannot start one.
      await this.deps.chatRuns.finalize(run.id, {
        from: ['pending'],
        status: 'cancelled',
        error_code: null,
      });
      return { run_id: runHandle, status: 'cancelled' };
    }

    const session = this.deps.hub.get(runHandle);
    const live = session && !session.isFinished ? session : undefined;
    const upstreamRunId = live?.upstreamRunId ?? run.upstream_run_id;

    if (!upstreamRunId) {
      if (live) {
        // The stream is ours but sineva-ai has not reported its run id yet:
        // the drain fires the cancel the moment `run_started` arrives.
        live.cancelRequested = true;
        return { run_id: runHandle, status: 'cancelling' };
      }
      throw new DomainError({
        message: 'This reply cannot be stopped right now.',
        code: 'run_not_cancellable',
        status: 409,
      });
    }

    const { token } = await this.deps.contextSigner.mint(context, {
      agent_slug: run.agent_slug,
      run_id: runHandle,
    });
    // A gateway failure propagates as the typed 502 or 503; the run goes on.
    await this.deps.gateway.cancelRun({
      runId: upstreamRunId,
      contextToken: token,
      requestId: context.request_id,
    });
    if (live) live.cancelAcknowledged = true;
    return { run_id: runHandle, status: 'cancelling' };
  }
}
