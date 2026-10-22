import { chatTurnRequestV2Schema } from '@/server/application/dtos/chat_v2_dto';
import {
  squadHandoffEventSchema,
  squadHandoffResultEventSchema,
  squadTurnLimitEventSchema,
} from '@/server/application/dtos/squad_dto';
import {
  approvalRequiredEventSchema,
  inputRequiredEventSchema,
} from '@/server/application/inbox/approval_contract_dto';
import {
  sseDoneEventSchema,
  sseErrorEventSchema,
  sseTokenEventSchema,
} from '@/server/application/dtos/chat_v2_dto';
import type { RunHub, RunSession } from '@/server/application/chat/run_hub';
import { resolveOwnedRun, type OwnedRun } from '@/server/application/chat/resolve_owned_run';
import { findMentionSpans } from '@/server/domain/chat/mention_spans';
import type { GuardedCard, RunFrameGuard, RunFrameScope } from '@/server/domain/chat/run_frame_guard';
import type { RunRelayLog } from '@/server/domain/chat/run_relay_log';
import type { RunMetricsRecorder, RunOutcome } from '@/server/domain/chat/run_metrics';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { ContextSigner } from '@/server/domain/context/signed_context';
import {
  isTerminalRunStatus,
  type ChatRunEntity,
  type ChatRunStatus,
} from '@/server/domain/entities/chat_run';
import type { MessageStatus } from '@/server/domain/entities/message';
import {
  ContextInvalidError,
  DependencyUnavailableError,
  DomainError,
  ForbiddenError,
  ModelUnavailableError,
  NotFoundError,
  UpstreamServiceError,
  UpstreamUnavailableError,
  ValidationError,
} from '@/server/domain/errors/domain_error';
import type { InboxItemCreator } from '@/server/domain/inbox/inbox_item_creator';
import type { AiEngineGateway } from '@/server/domain/repositories/ai_engine_gateway';
import type { ChatRunRepository } from '@/server/domain/repositories/chat_run_repository';
import type { ConversationRepository } from '@/server/domain/repositories/conversation_repository';
import type { SquadTurnPort } from '@/server/domain/squads/squad_ports';
import type {
  MessageCardRepository,
  NewMessageCard,
} from '@/server/domain/repositories/message_card_repository';
import type { MessageRepository } from '@/server/domain/repositories/message_repository';
import {
  SseParser,
  encodeSseComment,
  encodeSseFrame,
  type SseFrame,
  type SseItem,
} from '@/shared/sse';

export interface StreamRunDeps {
  conversations: ConversationRepository;
  messages: MessageRepository;
  cards: MessageCardRepository;
  chatRuns: ChatRunRepository;
  gateway: AiEngineGateway;
  contextSigner: ContextSigner;
  hub: RunHub;
  /** Turns `approval_required` and `input_required` into Inbox items (ADR-0032). */
  inbox: InboxItemCreator;
  /** Squad turns (ADR-0044). Without it a squad conversation fails to start, honestly. */
  squads?: SquadTurnPort;
  guard: RunFrameGuard;
  metrics: RunMetricsRecorder;
  log: RunRelayLog;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** How often a resumed attach asks sineva-ai for new events of a running run. */
  poll_interval_ms?: number;
  /** How long a resumed attach follows a run before giving up with an error event. */
  replay_deadline_ms?: number;
}

/** A relay-authored error event. Upstream `error` events are forwarded untouched instead. */
interface RelayError {
  code: string;
  status: number;
  message: string;
  retryable: boolean;
}

/** What a finished run leaves behind, derived from its terminal frame. */
interface Terminal {
  runStatus: ChatRunStatus;
  messageStatus: MessageStatus;
  outcome: RunOutcome;
  content: string;
  finishReason: string | null;
  errorCode: string | null;
  agentSlug: string | null;
  replyLanguage: string;
  upstreamRunId: string | null;
  upstreamSessionId: string | null;
  /** The `squad` block of a squad `done` frame, passed to the squad port untouched. */
  squad?: Record<string, unknown> | null;
}

/** Squad events the relay validates and hands to the squad port (ADR-0044). */
const SQUAD_EVENT_SCHEMAS = {
  handoff: squadHandoffEventSchema,
  handoff_result: squadHandoffResultEventSchema,
  turn_limit: squadTurnLimitEventSchema,
} as const;

/** What one drain tracks while it reads the upstream stream. */
interface DrainState {
  text: string;
  firstTokenAt: number | null;
  terminal: boolean;
  /** Cards the guard validated or rejected, stored with the reply. */
  scope: RunFrameScope;
  /** Producer card id to platform approval id, so a stored card links to the Inbox record. */
  approvalByCard: Map<string, string>;
}

const encoder = new TextEncoder();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function relayErrorFor(error: unknown): RelayError {
  if (error instanceof ModelUnavailableError) {
    return { code: 'model_unavailable', status: 503, retryable: true, message: 'The reply service is busy. Try again in a moment.' };
  }
  if (error instanceof DependencyUnavailableError) {
    return { code: 'dependency_unavailable', status: 503, retryable: true, message: 'The reply service is not ready. Try again in a moment.' };
  }
  if (error instanceof UpstreamUnavailableError) {
    return { code: 'upstream_unavailable', status: 503, retryable: true, message: 'The reply service is unavailable. Try again in a moment.' };
  }
  if (error instanceof UpstreamServiceError) {
    return { code: 'upstream_error', status: 502, retryable: true, message: 'The reply service returned something unexpected. Try again.' };
  }
  // A squad that changed between the message and the stream (ADR-0044).
  if (error instanceof ForbiddenError) {
    return { code: 'forbidden', status: 403, retryable: false, message: 'You no longer have access to this.' };
  }
  if (error instanceof NotFoundError) {
    return { code: 'not_found', status: 404, retryable: false, message: 'This could not be found.' };
  }
  if (error instanceof ValidationError) {
    return { code: 'squad_unavailable', status: 422, retryable: false, message: 'This squad cannot take a turn right now.' };
  }
  if (error instanceof ContextInvalidError || error instanceof DomainError) {
    return { code: 'internal_error', status: 500, retryable: false, message: 'Something went wrong on our side.' };
  }
  return { code: 'internal_error', status: 500, retryable: false, message: 'Something went wrong on our side.' };
}

function relayErrorFrame(error: RelayError): SseFrame {
  return { event: 'error', data: JSON.stringify(error) };
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * Browser to platform to sineva-ai relay (ADR-0022, FR-AIR-11, FR-AIR-12,
 * FR-HUB-20). The first attach to a run handle starts the upstream stream and
 * reads it in a detached loop that outlives the browser connection; later
 * attaches are served from memory or from sineva-ai's replay endpoint.
 */
export class StreamRunUseCase {
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly pollIntervalMs: number;
  private readonly replayDeadlineMs: number;
  /** Run handles of squad conversations that are still open on this instance; see `finishSquad`. */
  private readonly squadRuns = new Set<string>();

  constructor(private readonly deps: StreamRunDeps) {
    this.now = deps.now ?? Date.now;
    this.sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.pollIntervalMs = deps.poll_interval_ms ?? 1_000;
    this.replayDeadlineMs = deps.replay_deadline_ms ?? 5 * 60_000;
  }

  async execute(
    runHandle: string,
    input: { last_event_id?: string },
    context: RequestContext,
  ): Promise<ReadableStream<Uint8Array>> {
    // Ownership first: nothing below runs for a handle the caller does not own.
    const owned = await resolveOwnedRun(this.deps, runHandle, context);
    if (owned.conversation.kind === 'squad') this.squadRuns.add(runHandle);
    const run = await this.deps.chatRuns.findOrCreate({
      workspace_id: owned.conversation.workspace_id,
      conversation_id: owned.conversation.id,
      user_message_id: owned.userMessage.id,
      run_handle: runHandle,
      agent_slug: owned.userMessage.agent_slug ?? owned.conversation.agent_slug ?? 'sino',
    });

    const live = this.deps.hub.get(runHandle);
    if (live) return this.attach(live, input.last_event_id);

    if (run.status !== 'pending') {
      return this.replay(run, input.last_event_id, context);
    }

    // The session is registered synchronously, with no await between the
    // lookup above and here, so two attaches in this process cannot both
    // start a run. The conditional claim covers other processes.
    const session = this.deps.hub.create(runHandle);
    const claimed = await this.deps.chatRuns.claimStart(run.id);
    if (!claimed) {
      session.publish({
        kind: 'frame',
        frame: relayErrorFrame({
          code: 'run_busy',
          status: 409,
          retryable: true,
          message: 'This reply is already starting. Reconnecting.',
        }),
      });
      session.finish();
      this.deps.hub.release(runHandle, session);
      return this.attach(session, input.last_event_id);
    }

    this.deps.hub.track(
      runHandle,
      this.drain(run, owned, session, context),
    );
    return this.attach(session, input.last_event_id);
  }

  // ---------------------------------------------------------------------
  // Browser side
  // ---------------------------------------------------------------------

  private attach(session: RunSession, lastEventId: string | undefined): ReadableStream<Uint8Array> {
    let unsubscribe = () => {};
    let open = true;
    return new ReadableStream<Uint8Array>({
      start: (controller) => {
        unsubscribe = session.subscribe(lastEventId, {
          onItem: (item) => {
            if (!open) return;
            controller.enqueue(encoder.encode(this.encode(item)));
          },
          onEnd: () => {
            if (!open) return;
            open = false;
            controller.close();
          },
        });
      },
      // A closed tab only detaches this reader; the run keeps draining.
      cancel: () => {
        open = false;
        unsubscribe();
      },
    });
  }

  private encode(item: SseItem): string {
    return item.kind === 'frame' ? encodeSseFrame(item.frame) : encodeSseComment(item.text);
  }

  // ---------------------------------------------------------------------
  // First attach: start upstream and keep draining
  // ---------------------------------------------------------------------

  private async drain(
    run: ChatRunEntity,
    owned: OwnedRun,
    session: RunSession,
    context: RequestContext,
  ): Promise<void> {
    const startedAt = this.now();
    let body: ReadableStream<Uint8Array>;

    try {
      const sessionId = await this.deps.chatRuns.findLatestSessionId(owned.conversation.id);
      const message = owned.userMessage;
      // Validated against the contract schema so drift fails here, loudly,
      // instead of as an upstream 422 in production.
      const request = chatTurnRequestV2Schema.parse({
        user_message: message.content,
        session_id: sessionId,
        client_message_id:
          message.client_message_id && UUID.test(message.client_message_id)
            ? message.client_message_id
            : message.id,
        mentions: findMentionSpans(message.content),
      });
      if (owned.conversation.kind === 'squad') {
        // The squad is re-checked now, not trusted from when the message was
        // stored, and its claim is built from stored data only.
        if (!this.deps.squads) throw new Error('squad turns are not wired');
        const plan = await this.deps.squads.prepare({
          conversation: owned.conversation,
          run_handle: run.run_handle,
          agent_slug: run.agent_slug,
          context,
        });
        const { token } = await this.deps.contextSigner.mint(context, {
          agent_slug: run.agent_slug,
          run_id: run.run_handle,
          squad: plan.claim,
          budget: plan.budget,
        });
        body = await this.deps.gateway.squadChatStream({
          squadId: plan.squad_id,
          request,
          contextToken: token,
          requestId: context.request_id,
        });
      } else {
        const { token } = await this.deps.contextSigner.mint(context, {
          agent_slug: run.agent_slug,
          run_id: run.run_handle,
        });
        body = await this.deps.gateway.chatStream({
          agentSlug: run.agent_slug,
          request,
          contextToken: token,
          requestId: context.request_id,
        });
      }
    } catch (error) {
      await this.failToStart(run, session, error);
      return;
    }

    const state: DrainState = {
      text: '',
      firstTokenAt: null,
      terminal: false,
      scope: { run_handle: run.run_handle, cards: [] },
      approvalByCard: new Map(),
    };
    const reader = body.getReader();
    const decoder = new TextDecoder();
    const parser = new SseParser();

    try {
      read: for (;;) {
        const { done, value } = await reader.read();
        const items = done
          ? parser.flush()
          : parser.push(decoder.decode(value, { stream: true }));
        for (const item of items) {
          if (await this.handleUpstreamItem(item, run, session, state, startedAt, context)) {
            break read;
          }
        }
        if (done) break;
      }
    } catch (error) {
      this.deps.log.failed('upstream_stream_broke', { run_handle: run.run_handle, cause: error });
    }

    if (!state.terminal) {
      await this.endWithoutTerminal(run, session, state, startedAt);
    } else {
      // The terminal frame was the last thing we need; release the connection.
      await reader.cancel().catch((error: unknown) => {
        this.deps.log.failed('release_stream_failed', { run_handle: run.run_handle, cause: error });
      });
    }

    session.finish();
    this.deps.hub.releaseLater(run.run_handle, session);
  }

  /** Returns true once the run has reached its end and reading can stop. */
  private async handleUpstreamItem(
    item: SseItem,
    run: ChatRunEntity,
    session: RunSession,
    state: DrainState,
    startedAt: number,
    context: RequestContext,
  ): Promise<boolean> {
    if (item.kind === 'comment') {
      session.publish(item);
      return false;
    }
    const frame = this.deps.guard.transform(item.frame, state.scope);
    if (!frame) return false;

    if (frame.event === 'token') {
      const parsed = sseTokenEventSchema.safeParse(parseJson(frame.data));
      if (!parsed.success) {
        await this.failBadResponse(run, session, state, startedAt);
        return true;
      }
      state.firstTokenAt ??= this.now();
      state.text += parsed.data.token;
      session.publish({ kind: 'frame', frame });
      return false;
    }

    if (frame.event === 'run_started') {
      const data = parseJson(frame.data) as { run_id?: unknown } | undefined;
      if (typeof data?.run_id === 'string') {
        session.upstreamRunId = data.run_id;
        await this.deps.chatRuns.recordUpstream(run.id, { upstream_run_id: data.run_id });
        if (session.cancelRequested && !session.cancelAcknowledged) {
          void this.fireCancel(run, session, context);
        }
      }
      session.publish({ kind: 'frame', frame });
      return false;
    }

    if (this.squadRuns.has(run.run_handle) && frame.event in SQUAD_EVENT_SCHEMAS) {
      if (await this.recordSquadFrame(frame, run, context)) session.publish({ kind: 'frame', frame });
      return false;
    }

    if (frame.event === 'approval_required' || frame.event === 'input_required') {
      const bridged = await this.bridgeInboxFrame(frame, run, context, session.upstreamRunId, state.approvalByCard);
      if (bridged) session.publish({ kind: 'frame', frame: bridged });
      return false;
    }

    if (frame.event === 'done' || frame.event === 'error') {
      const terminal = this.terminalFromFrame(frame, state.text);
      if (!terminal) {
        await this.failBadResponse(run, session, state, startedAt);
        return true;
      }
      state.terminal = true;
      // Store first, forward second: when the browser sees `done` the message
      // is already on disk, so a reload cannot lose it.
      const stored = await this.storeTerminal(run, session, terminal, this.linkedCards(state.scope.cards, state.approvalByCard));
      if (stored) {
        session.publish({ kind: 'frame', frame });
      } else {
        session.publish({
          kind: 'frame',
          frame: relayErrorFrame({
            code: 'dependency_unavailable',
            status: 503,
            retryable: false,
            message: 'The reply could not be saved. Reload to check this chat.',
          }),
        });
      }
      this.recordMetrics(run, terminal, state.firstTokenAt, startedAt);
      return true;
    }

    session.publish({ kind: 'frame', frame });
    return false;
  }

  private async failToStart(run: ChatRunEntity, session: RunSession, error: unknown): Promise<void> {
    this.squadRuns.delete(run.run_handle);
    const relayError = relayErrorFor(error);
    if (relayError.code === 'internal_error') {
      this.deps.log.failed('start_failed', { run_handle: run.run_handle, cause: error });
    }
    try {
      // Back to pending, so Retry on this handle can start a fresh run.
      await this.deps.chatRuns.releaseStart(run.id, relayError.code);
    } catch (releaseError) {
      this.deps.log.failed('release_run_failed', { run_handle: run.run_handle, cause: releaseError });
    }
    session.publish({ kind: 'frame', frame: relayErrorFrame(relayError) });
    session.finish();
    this.deps.hub.release(run.run_handle, session);
  }

  private async failBadResponse(
    run: ChatRunEntity,
    session: RunSession,
    state: DrainState,
    startedAt: number,
  ): Promise<void> {
    this.deps.log.failed('bad_frame', { run_handle: run.run_handle });
    state.terminal = true;
    const terminal = this.errorTerminal('upstream_bad_response', state.text);
    await this.storeTerminal(run, session, terminal, this.linkedCards(state.scope.cards, state.approvalByCard));
    session.publish({
      kind: 'frame',
      frame: relayErrorFrame({
        code: 'upstream_bad_response',
        status: 502,
        retryable: false,
        message: 'The reply service returned something unexpected.',
      }),
    });
    this.recordMetrics(run, terminal, state.firstTokenAt, startedAt);
  }

  /** The upstream body ended (or broke) before a `done` or `error` frame. */
  private async endWithoutTerminal(
    run: ChatRunEntity,
    session: RunSession,
    state: DrainState,
    startedAt: number,
  ): Promise<void> {
    if (session.cancelAcknowledged) {
      // sineva-ai accepted the Stop and closed the stream: that is the
      // cancelled outcome, with the text streamed so far kept.
      const terminal: Terminal = {
        ...this.errorTerminal('cancelled', state.text),
        runStatus: 'cancelled',
        messageStatus: 'cancelled',
        outcome: 'cancelled',
        errorCode: null,
      };
      await this.storeTerminal(run, session, terminal, this.linkedCards(state.scope.cards, state.approvalByCard));
      session.publish({
        kind: 'frame',
        frame: relayErrorFrame({
          code: 'run_cancelled',
          status: 409,
          retryable: false,
          message: 'This reply was stopped.',
        }),
      });
      this.recordMetrics(run, terminal, state.firstTokenAt, startedAt);
      return;
    }

    const terminal = this.errorTerminal('upstream_interrupted', state.text);
    await this.storeTerminal(run, session, terminal, this.linkedCards(state.scope.cards, state.approvalByCard));
    session.publish({
      kind: 'frame',
      frame: relayErrorFrame({
        code: 'upstream_interrupted',
        status: 502,
        retryable: false,
        message: 'The reply was interrupted before it finished.',
      }),
    });
    this.recordMetrics(run, terminal, state.firstTokenAt, startedAt);
  }

  // ---------------------------------------------------------------------
  // Squad events (ADR-0044)
  // ---------------------------------------------------------------------

  /**
   * Validates a squad event and stores it. Returns whether to forward it: a
   * payload that is off contract is dropped with a log line, never shown as a
   * card the platform could not store. A storage failure is logged and the
   * event is still forwarded, because the browser's live card is correct and
   * the next replay stores it again (writes are idempotent).
   */
  private async recordSquadFrame(frame: SseFrame, run: ChatRunEntity, context: RequestContext): Promise<boolean> {
    const schema = SQUAD_EVENT_SCHEMAS[frame.event as keyof typeof SQUAD_EVENT_SCHEMAS];
    const data = parseJson(frame.data);
    if (!schema.safeParse(data).success) {
      this.deps.log.failed('squad_frame_failed', { run_handle: run.run_handle });
      return false;
    }
    try {
      await this.deps.squads?.recordFrame({ run_handle: run.run_handle, event: frame.event, data, context });
    } catch (error) {
      this.deps.log.failed('squad_frame_failed', { run_handle: run.run_handle, cause: error });
    }
    return true;
  }

  /** Closes the squad turn from the run's terminal state. Called once, by the writer that won the finalize. */
  private async finishSquad(run: ChatRunEntity, terminal: Terminal): Promise<void> {
    if (!this.squadRuns.delete(run.run_handle)) return;
    const outcome =
      terminal.runStatus === 'cancelled'
        ? 'cancelled'
        : terminal.runStatus === 'error' || terminal.runStatus === 'failed'
          ? 'failed'
          : 'completed';
    try {
      await this.deps.squads?.finish({ run_handle: run.run_handle, outcome, squad: terminal.squad ?? null });
    } catch (error) {
      this.deps.log.failed('squad_finish_failed', { run_handle: run.run_handle, cause: error });
    }
  }

  // ---------------------------------------------------------------------
  // Inbox bridge (ADR-0032)
  // ---------------------------------------------------------------------

  /**
   * Turns an `approval_required` or `input_required` frame into an Inbox item
   * and returns the frame the browser gets: platform ids, the summary, expiry
   * and guardrail reason, never the draft body (that lives in the Inbox detail
   * behind the role check). The recipient is the owner of this run, taken from
   * the caller's session. A failure is logged and the frame is dropped rather
   * than forwarded with an upstream id the browser cannot use; the producer can
   * still create the item through the internal endpoint, which is idempotent.
   */
  private async bridgeInboxFrame(
    frame: SseFrame,
    run: ChatRunEntity,
    context: RequestContext,
    upstreamRunId: string | null | undefined,
    approvalByCard: Map<string, string>,
  ): Promise<SseFrame | null> {
    const data = parseJson(frame.data);
    try {
      if (frame.event === 'approval_required') {
        const parsed = approvalRequiredEventSchema.safeParse(data);
        if (!parsed.success) throw new Error('approval_required off contract');
        const event = parsed.data;
        const created = await this.deps.inbox.create(
          {
            kind: 'approval',
            workspace_id: run.workspace_id,
            recipient_user_id: context.user_id,
            agent_slug: event.agent_slug ?? run.agent_slug,
            title: event.draft_summary,
            source: { type: 'chat', id: run.run_handle },
            approval: {
              upstream_approval_id: event.approval_id,
              upstream_run_id: upstreamRunId ?? run.upstream_run_id,
              revision: event.revision,
              action_type: event.action_kind,
              payload: event.payload,
              guardrail_reason: event.guardrail_reason,
              expires_at: event.expires_at ? new Date(event.expires_at) : null,
            },
          },
          context,
        );
        if (!created.approval) throw new Error('approval missing');
        if (event.card_id) approvalByCard.set(event.card_id, created.approval.id);
        return {
          ...frame,
          data: JSON.stringify({
            approval_id: created.approval.id,
            inbox_item_id: created.item.id,
            revision: created.approval.revision,
            action_kind: created.approval.action_type,
            draft_summary: created.item.title,
            expires_at: created.approval.expires_at,
            guardrail_reason: created.approval.guardrail_reason,
            ...(event.card_id ? { card_id: event.card_id } : {}),
          }),
        };
      }

      const parsed = inputRequiredEventSchema.safeParse(data);
      if (!parsed.success) throw new Error('input_required off contract');
      const event = parsed.data;
      const created = await this.deps.inbox.create(
        {
          kind: 'input_request',
          workspace_id: run.workspace_id,
          recipient_user_id: context.user_id,
          agent_slug: event.agent_slug ?? run.agent_slug,
          title: event.question,
          source: { type: 'chat', id: run.run_handle },
          input: {
            upstream_request_id: event.input_request_id,
            upstream_run_id: upstreamRunId ?? run.upstream_run_id,
            question: event.question,
            fields: event.fields,
            expires_at: event.expires_at ? new Date(event.expires_at) : null,
          },
        },
        context,
      );
      if (!created.input_request) throw new Error('input request missing');
      return {
        ...frame,
        data: JSON.stringify({
          input_request_id: created.input_request.id,
          inbox_item_id: created.item.id,
          question: created.input_request.question,
          fields: created.input_request.fields,
          expires_at: created.input_request.due_at,
        }),
      };
    } catch (error) {
      this.deps.log.failed('inbox_item_failed', { run_handle: run.run_handle, cause: error });
      return null;
    }
  }

  private linkedCards(cards: GuardedCard[], approvalByCard: Map<string, string>): GuardedCard[] {
    if (approvalByCard.size === 0) return cards;
    return cards.map((card) =>
      card.card_id && approvalByCard.has(card.card_id)
        ? { ...card, approval_id: approvalByCard.get(card.card_id) ?? card.approval_id }
        : card,
    );
  }

  // ---------------------------------------------------------------------
  // Terminal handling shared by the drain and the replay adoption
  // ---------------------------------------------------------------------

  private errorTerminal(code: string, partialText: string): Terminal {
    return {
      runStatus: 'error',
      messageStatus: 'error',
      outcome: 'error',
      content: partialText,
      finishReason: code,
      errorCode: code,
      agentSlug: null,
      replyLanguage: 'unknown',
      upstreamRunId: null,
      upstreamSessionId: null,
    };
  }

  private terminalFromFrame(frame: SseFrame, streamedText: string): Terminal | null {
    const data = parseJson(frame.data);
    if (frame.event === 'error') {
      const parsed = sseErrorEventSchema.safeParse(data);
      return parsed.success ? this.errorTerminal(parsed.data.code, streamedText) : null;
    }
    const parsed = sseDoneEventSchema.safeParse(data);
    if (!parsed.success) return null;
    const done = parsed.data;
    const cancelled = done.finish_reason === 'cancelled';
    const status: ChatRunStatus = cancelled ? 'cancelled' : done.status;
    return {
      runStatus: status,
      messageStatus: status,
      outcome: status,
      // `reply_content` is authoritative; the streamed text is the fallback
      // for a done that carries none (cancel keeps what was already shown).
      content: done.reply_content || streamedText,
      finishReason: done.finish_reason ?? null,
      errorCode: null,
      agentSlug: done.routed_agent_slug || done.agent_slug,
      replyLanguage: done.reply_language,
      upstreamRunId: done.run_id,
      upstreamSessionId: done.session_id,
      squad: this.squadBlockOf(data),
    };
  }

  private squadBlockOf(data: unknown): Record<string, unknown> | null {
    const squad = (data as { squad?: unknown } | undefined)?.squad;
    return typeof squad === 'object' && squad !== null && !Array.isArray(squad) ? (squad as Record<string, unknown>) : null;
  }

  /**
   * Moves the run to its terminal status and stores the assistant message.
   * The conditional finalize means that if two writers race (a drain and an
   * adopting resume on another instance) only one stores the message.
   * Returns false only when the message could not be saved.
   */
  private async storeTerminal(
    run: ChatRunEntity,
    session: RunSession | null,
    terminal: Terminal,
    cards: GuardedCard[],
  ): Promise<boolean> {
    try {
      const won = await this.deps.chatRuns.finalize(run.id, {
        from: ['streaming'],
        status: terminal.runStatus,
        error_code: terminal.errorCode,
      });
      if (!won) {
        this.squadRuns.delete(run.run_handle);
        return true;
      }
      await this.finishSquad(run, terminal);

      const upstreamRunId = terminal.upstreamRunId ?? session?.upstreamRunId ?? null;
      if (upstreamRunId || terminal.upstreamSessionId) {
        await this.deps.chatRuns.recordUpstream(run.id, {
          upstream_run_id: upstreamRunId,
          upstream_session_id: terminal.upstreamSessionId,
        });
      }
      const message = await this.deps.messages.create({
        conversation_id: run.conversation_id,
        role: 'assistant',
        agent_slug: terminal.agentSlug ?? run.agent_slug,
        content: terminal.content,
        status: terminal.messageStatus,
        finish_reason: terminal.finishReason,
        run_id: run.run_handle,
        channel: 'web',
      });
      await this.deps.chatRuns.setAssistantMessage(run.id, message.id);
      await this.deps.conversations.updateLastMessageAt(run.conversation_id, new Date());
      await this.storeCards(run, message.id, cards);
      return true;
    } catch (error) {
      this.deps.log.failed('store_reply_failed', { run_handle: run.run_handle, cause: error });
      return false;
    }
  }

  /**
   * Saves the cards of a reply. A failure here is logged and does not fail the
   * reply: the text is already stored, and a missing card degrades to the
   * message text on reload, which is the same fallback a rejected card gets.
   */
  private async storeCards(run: ChatRunEntity, messageId: string, cards: GuardedCard[]): Promise<void> {
    if (cards.length === 0) return;
    try {
      await this.deps.cards.createMany(cards.map((card) => this.toNewCard(run, messageId, card)));
    } catch (error) {
      this.deps.log.failed('store_cards_failed', { run_handle: run.run_handle, cause: error });
    }
  }

  private toNewCard(run: ChatRunEntity, messageId: string, card: GuardedCard): NewMessageCard {
    const base = {
      message_id: messageId,
      conversation_id: run.conversation_id,
      workspace_id: run.workspace_id,
      run_id: run.run_handle,
      call_id: card.call_id,
      position: card.position,
      approval_id: card.approval_id,
    };
    if (!card.outcome.ok) {
      // A rejected card keeps its code and the producer's fallback text, never its data.
      return {
        ...base,
        approval_id: null,
        card_type: card.outcome.claimed_type ?? 'unknown',
        schema_version: card.outcome.claimed_version ?? 0,
        state: 'failed',
        provider_slug: null,
        connection_id: null,
        data: {},
        actions: [],
        fallback_text: card.outcome.fallback_text,
        payload_hash: null,
        validation_status: 'rejected',
        rejected_code: card.outcome.code,
        search_text: card.outcome.fallback_text,
        data_expires_at: null,
      };
    }
    const valid = card.outcome.card;
    return {
      ...base,
      card_type: valid.card_type,
      schema_version: valid.schema_version,
      state: card.state,
      provider_slug: valid.provider?.slug ?? null,
      connection_id: valid.provider?.connection_id ?? null,
      data: valid.data,
      actions: valid.actions,
      fallback_text: valid.fallback_text,
      payload_hash: valid.payload_hash,
      validation_status: 'valid',
      rejected_code: null,
      search_text: valid.fallback_text,
      data_expires_at: valid.data_expires_at,
    };
  }

  private recordMetrics(
    run: ChatRunEntity,
    terminal: Terminal,
    firstTokenAt: number | null,
    startedAt: number,
  ): void {
    this.deps.metrics.record({
      agent_slug: terminal.agentSlug ?? run.agent_slug,
      reply_language: terminal.replyLanguage,
      outcome: terminal.outcome,
      first_token_ms: firstTokenAt === null ? null : firstTokenAt - startedAt,
      total_ms: this.now() - startedAt,
    });
  }

  private async fireCancel(
    run: ChatRunEntity,
    session: RunSession,
    context: RequestContext,
  ): Promise<void> {
    if (!session.upstreamRunId) return;
    try {
      // The context of the attach that started the run: same owner, fresh token.
      const { token } = await this.deps.contextSigner.mint(context, {
        agent_slug: run.agent_slug,
        run_id: run.run_handle,
      });
      await this.deps.gateway.cancelRun({ runId: session.upstreamRunId, contextToken: token });
      session.cancelAcknowledged = true;
    } catch (error) {
      this.deps.log.failed('deferred_cancel_failed', { run_handle: run.run_handle, cause: error });
    }
  }

  // ---------------------------------------------------------------------
  // Later attaches: serve from sineva-ai's stored events
  // ---------------------------------------------------------------------

  private replay(
    run: ChatRunEntity,
    lastEventId: string | undefined,
    context: RequestContext,
  ): ReadableStream<Uint8Array> {
    let aborted = false;
    return new ReadableStream<Uint8Array>({
      start: (controller) => {
        const emit = (frame: SseFrame) => {
          if (!aborted) controller.enqueue(encoder.encode(encodeSseFrame(frame)));
        };
        void this.pumpReplay(run, lastEventId, context, emit, () => aborted).finally(() => {
          if (!aborted) controller.close();
        });
      },
      cancel: () => {
        aborted = true;
      },
    });
  }

  private async pumpReplay(
    initial: ChatRunEntity,
    lastEventId: string | undefined,
    context: RequestContext,
    emit: (frame: SseFrame) => void,
    isAborted: () => boolean,
  ): Promise<void> {
    try {
      if (!initial.upstream_run_id) {
        emit(relayErrorFrame(this.unresumable(initial)));
        return;
      }

      let after = Number(lastEventId);
      if (!Number.isFinite(after)) after = 0;
      const scope: RunFrameScope = { run_handle: initial.run_handle, cards: [] };
      const approvalByCard = new Map<string, string>();
      const deadline = this.now() + this.replayDeadlineMs;
      let run = initial;

      while (!isAborted()) {
        const { token } = await this.deps.contextSigner.mint(context, {
          agent_slug: run.agent_slug,
          run_id: run.run_handle,
        });
        const { events } = await this.deps.gateway.getRunEvents({
          runId: run.upstream_run_id as string,
          afterSeq: after,
          contextToken: token,
          requestId: context.request_id,
        });

        let sawTerminal = false;
        for (const event of events) {
          const raw: SseFrame = {
            ...(event.id !== undefined ? { id: event.id } : {}),
            event: event.event,
            data: typeof event.data === 'string' ? event.data : JSON.stringify(event.data),
          };
          const frame = this.deps.guard.transform(raw, scope);
          if (!frame) continue;
          if (frame.id !== undefined && Number.isFinite(Number(frame.id))) {
            after = Number(frame.id);
          }
          if (this.squadRuns.has(run.run_handle) && frame.event in SQUAD_EVENT_SCHEMAS) {
            // Idempotent: the drain may have stored this event already.
            if (await this.recordSquadFrame(frame, run, context)) emit(frame);
            continue;
          }
          if (frame.event === 'approval_required' || frame.event === 'input_required') {
            // Idempotent: the item already exists when the drain saw this frame first.
            const bridged = await this.bridgeInboxFrame(frame, run, context, run.upstream_run_id, approvalByCard);
            if (bridged) emit(bridged);
            continue;
          }
          emit(frame);
          if (frame.event === 'done' || frame.event === 'error') {
            sawTerminal = true;
            await this.adopt(run, frame, this.linkedCards(scope.cards, approvalByCard));
          }
        }
        if (sawTerminal) return;

        run = (await this.deps.chatRuns.findByHandle(run.run_handle)) ?? run;
        if (isTerminalRunStatus(run.status) && events.length === 0) return;
        if (this.now() > deadline) {
          emit(
            relayErrorFrame({
              code: 'stream_timeout',
              status: 504,
              retryable: true,
              message: 'The reply is taking too long to come back. Reconnecting.',
            }),
          );
          return;
        }
        await this.sleep(this.pollIntervalMs);
      }
    } catch (error) {
      emit(relayErrorFrame(relayErrorFor(error)));
    }
  }

  private unresumable(run: ChatRunEntity): RelayError {
    if (run.status === 'cancelled') {
      return { code: 'run_cancelled', status: 409, retryable: false, message: 'This reply was stopped.' };
    }
    if (run.status === 'streaming') {
      return {
        code: 'run_busy',
        status: 409,
        retryable: true,
        message: 'This reply is still starting. Reconnecting.',
      };
    }
    return {
      code: run.error_code ?? 'run_not_resumable',
      status: 409,
      retryable: false,
      message: 'This reply can no longer be resumed.',
    };
  }

  /**
   * The run's drain died with its process before it stored the reply. A
   * resume that sees the terminal event finishes the job; the conditional
   * finalize makes this a no-op when the drain did store it.
   */
  private async adopt(run: ChatRunEntity, frame: SseFrame, cards: GuardedCard[]): Promise<void> {
    const current = await this.deps.chatRuns.findByHandle(run.run_handle);
    if (!current || current.status !== 'streaming') return;
    const terminal = this.terminalFromFrame(frame, '');
    if (!terminal) return;
    await this.storeTerminal(current, null, terminal, cards);
  }
}
