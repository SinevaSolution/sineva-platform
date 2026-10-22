import type { RequestContext } from '@/server/domain/context/request_context';
import type { ContextSigner } from '@/server/domain/context/signed_context';
import { DomainError } from '@/server/domain/errors/domain_error';
import { RunResumeUnavailableError } from '@/server/domain/inbox/inbox_errors';
import type { AiEngineGateway, ResumeRunBody } from '@/server/domain/repositories/ai_engine_gateway';

export interface ResumeParams {
  /** sineva-ai run id; null when it was never reported, which cannot be resumed. */
  upstream_run_id: string | null;
  /** The run's owner: sineva-ai finds the paused session under this identity, so the decider is not used. */
  recipient_user_id: string | null;
  context: RequestContext;
  agent_slug: string;
  /** The platform run handle, the `run_id` claim of the signed context. */
  run_handle: string | null;
  body: ResumeRunBody;
  idempotency_key: string;
}

/**
 * Tells the paused run the outcome. An unreachable sineva-ai (any 503) becomes
 * the typed `run_resume_unavailable`, a bad answer stays the typed 502, so the
 * caller can leave the item pending instead of pretending it resumed
 * (ADR-0008, ADR-0016, ADR-0032).
 */
export async function resumeUpstream(
  deps: { gateway: AiEngineGateway; contextSigner: ContextSigner },
  params: ResumeParams,
): Promise<void> {
  try {
    if (!params.upstream_run_id) throw new RunResumeUnavailableError();
    const owner: RequestContext = {
      ...params.context,
      user_id: params.recipient_user_id ?? params.context.user_id,
    };
    const { token } = await deps.contextSigner.mint(owner, {
      agent_slug: params.agent_slug,
      run_id: params.run_handle,
    });
    await deps.gateway.resumeRun({
      runId: params.upstream_run_id,
      body: params.body,
      idempotencyKey: params.idempotency_key,
      contextToken: token,
      requestId: params.context.request_id,
    });
  } catch (error) {
    if (error instanceof RunResumeUnavailableError) throw error;
    if (error instanceof DomainError && error.status === 503) throw new RunResumeUnavailableError();
    throw error;
  }
}
