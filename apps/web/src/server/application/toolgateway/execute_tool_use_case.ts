import { hashPayload } from '@/server/domain/approvals/action_types';
import {
  USABLE_CONNECTION_STATUSES,
  type ConnectionEntity,
} from '@/server/domain/connections/connection';
import type { ActionDefinition } from '@/server/domain/connections/connector';
import type { RequestContext } from '@/server/domain/context/request_context';
import { DomainError } from '@/server/domain/errors/domain_error';
import type { GatewayContext } from '@/server/domain/toolgateway/gateway_context';
import type {
  ApprovedGatewayCall,
  GatewayDeps,
  GatewayRequest,
  GatewayResponse,
} from '@/server/domain/toolgateway/gateway_ports';
import {
  ToolGatewayError,
  ToolResultTruncatedError,
} from '@/server/domain/toolgateway/tool_executor';

/** The gateway owns permission checks and credentials. A provider adapter only performs an admitted call. */
export class ExecuteToolUseCase {
  constructor(private readonly deps: GatewayDeps) {}

  async execute(request: GatewayRequest, signedContext: string): Promise<GatewayResponse> {
    const claims = await this.deps.verifier.verify(signedContext);
    return this.perform(request, claims);
  }

  async executeApproved(approvalId: string, decider: RequestContext): Promise<GatewayResponse> {
    if (!decider.workspace_id) throw new ToolGatewayError('action_not_allowed');
    const call = await this.deps.state.loadApprovalCall(
      decider.workspace_id,
      approvalId,
      decider.user_id,
    );
    return this.perform(call.request, call.claims, { ...call, approval_id: approvalId });
  }

  async executeApproval(approvalId: string, context: RequestContext): Promise<void> {
    const response = await this.executeApproved(approvalId, context);
    if (response.status !== 'ok')
      throw new ToolGatewayError(response.error_code ?? 'provider_unavailable', 503);
  }

  private async perform(
    request: GatewayRequest,
    claims: GatewayContext,
    approved?: ApprovedGatewayCall & { approval_id: string },
  ): Promise<GatewayResponse> {
    const context: RequestContext = {
      user_id: claims.user_id,
      workspace_id: claims.tenant_id,
      role: claims.role,
      session_id: 'internal:tool-gateway',
      request_id: claims.request_id,
    };
    let payloadHash = hashPayload({
      tool_name: request.tool_name,
      arguments: request.arguments,
      run_id: request.run_id,
      mode: request.mode,
    });
    let reservationId: string | null = null;
    let finished = false;
    let invoked = false;
    let writeAction = false;
    try {
      const current = await this.deps.state.authorize(claims);
      if (request.run_id !== claims.run_id) throw new ToolGatewayError('action_not_allowed');
      const action = this.deps.registry.action(request.tool_name);
      if (!action) throw new ToolGatewayError('action_not_allowed');
      const write = action.side_effect !== 'read';
      writeAction = write;
      if (
        await this.deps.state.isBlocked(
          claims.tenant_id,
          action.provider_id,
          claims.agent_slug,
          write,
        )
      ) {
        throw new ToolGatewayError('kill_switch_active');
      }
      const visible = await this.deps.connections.listVisible(claims.tenant_id, claims.user_id, {
        provider_id: action.provider_id,
      });
      const candidates = [];
      for (const connection of visible) {
        // Re-check visibility so even a faulty repository adapter cannot leak a personal account.
        if (
          connection.workspace_id !== claims.tenant_id ||
          (connection.owner_scope === 'user' && connection.owner_user_id !== claims.user_id)
        )
          continue;
        const grant = (
          await this.deps.grants.listByConnection(claims.tenant_id, connection.id)
        ).find((g) => g.agent_slug === claims.agent_slug);
        if (grant) candidates.push({ connection, grant });
      }
      if (candidates.length === 0) throw new ToolGatewayError('connection_not_found', 404);
      if (candidates.length > 1) throw new ToolGatewayError('connection_ambiguous', 409);
      const { connection, grant } = candidates[0]!;
      if (connection.status === 'needs_reconnect')
        throw new ToolGatewayError('connection_needs_reconnect', 409);
      if (!USABLE_CONNECTION_STATUSES.includes(connection.status))
        throw new ToolGatewayError('provider_unavailable', 503);
      const provider = this.deps.registry.provider(action.provider_id);
      if (
        !provider ||
        provider.status === 'coming_soon' ||
        !this.deps.executor.supports(action.action_id)
      )
        throw new ToolGatewayError('action_not_allowed');
      if (provider.category === 'payments' && write)
        throw new ToolGatewayError('action_not_allowed');
      if (
        !claims.allowed_tools.includes(action.action_id) ||
        !claims.skill_tools.includes(action.action_id)
      )
        throw new ToolGatewayError('action_not_allowed');
      if (claims.agent_slug === 'sinoinsights' && write)
        throw new ToolGatewayError('action_not_allowed');
      if (write && grant.access_level !== 'write') throw new ToolGatewayError('action_not_allowed');
      if (current.role === 'viewer') throw new ToolGatewayError('action_not_allowed');
      if (!action.scopes.every((scope) => connection.granted_scopes.includes(scope)))
        throw new ToolGatewayError('connection_needs_reconnect', 409);
      const parsed = action.input_schema.safeParse(request.arguments);
      if (!parsed.success) throw new ToolGatewayError('invalid_tool_arguments', 422);
      const admitted = { ...request, arguments: parsed.data as Record<string, unknown> };
      payloadHash = hashPayload({
        tool_name: request.tool_name,
        arguments: admitted.arguments,
        run_id: request.run_id,
        mode: request.mode,
      });
      if (
        approved &&
        (approved.connection_id !== connection.id ||
          approved.external_account_id !== connection.external_account_id ||
          approved.payload_hash !== payloadHash)
      )
        throw new ToolGatewayError('approval_payload_mismatch', 409);
      if (write && request.mode === 'live' && !request.idempotency_key)
        throw new ToolGatewayError('idempotency_key_required', 422);
      const reservation = approved
        ? await this.deps.state.claimApproved(approved.id, approved.approval_id)
        : await this.deps.state.claim(claims, admitted, payloadHash, connection.id);
      if (reservation.status === 'replay') {
        await this.deps.audit.log({
          action: 'connection.tool_denied',
          context: current,
          actor: { type: 'specialist', id: claims.agent_slug },
          on_behalf_of_user_id: claims.user_id,
          run_id: claims.run_id,
          outcome: 'denied',
          reason_code: 'idempotent_replay',
          target_resource_type: 'connection',
          target_resource_id: connection.id,
          metadata: {
            tool_name: action.action_id,
            call_id: request.call_id,
            payload_hash: payloadHash,
          },
        });
        return reservation.response;
      }
      if (reservation.status === 'conflict')
        throw new ToolGatewayError('idempotency_conflict', 409);
      if (reservation.status === 'busy') throw new ToolGatewayError('tool_call_in_progress', 409);
      reservationId = reservation.id;
      let result: GatewayResponse;
      if (write && request.mode === 'simulate') {
        result = {
          status: 'ok',
          error_code: null,
          result: this.preview(action, admitted.arguments, claims.locale),
        };
      } else if (!approved && (write || grant.approval_policy === 'ask_every_time')) {
        return await this.deps.transactions.run(async () => {
          const approvalId = await this.deps.approvals.create({
            claims,
            request: admitted,
            connection_id: connection.id,
            external_account_id: connection.external_account_id,
            account_label: connection.account_label,
            action,
            payload_hash: payloadHash,
            gateway_call_id: reservation.id,
            context: current,
          });
          const result: GatewayResponse = {
            status: 'approval_required',
            approval_id: approvalId,
            error_code: 'approval_required',
          };
          await this.deps.audit.log({
            action: 'connection.tool_denied',
            context: current,
            actor: { type: 'specialist', id: claims.agent_slug },
            on_behalf_of_user_id: claims.user_id,
            run_id: claims.run_id,
            outcome: 'denied',
            reason_code: 'approval_required',
            target_resource_type: 'connection',
            target_resource_id: connection.id,
            metadata: {
              tool_name: action.action_id,
              call_id: request.call_id,
              payload_hash: payloadHash,
            },
          });
          await this.deps.state.finish(reservation.id, result);
          finished = true;
          return result;
        });
      } else {
        // An unknown policy must never loosen approval requirements.
        if (!approved && grant.approval_policy !== 'ask_for_writes')
          throw new ToolGatewayError('action_not_allowed');
        result = await this.call(claims, current, admitted, connection, action, payloadHash, () => {
          invoked = true;
        });
      }
      if (result.status !== 'ok' || result.result?.simulated) {
        await this.deps.audit.log({
          action: 'connection.tool_denied',
          context: current,
          actor: { type: 'specialist', id: claims.agent_slug },
          on_behalf_of_user_id: claims.user_id,
          run_id: claims.run_id,
          outcome: 'denied',
          reason_code: result.error_code ?? 'simulated',
          target_resource_type: 'connection',
          target_resource_id: connection.id,
          metadata: {
            tool_name: action.action_id,
            call_id: request.call_id,
            payload_hash: payloadHash,
            mode: request.mode,
          },
        });
      }
      await this.deps.transactions.run(async () => {
        await this.deps.state.finish(reservation.id, result);
        if (invoked)
          await this.deps.audit.log({
            action: 'connection.tool_completed',
            context: current,
            actor: { type: 'specialist', id: claims.agent_slug },
            on_behalf_of_user_id: claims.user_id,
            run_id: claims.run_id,
            outcome: 'allowed',
            target_resource_type: 'connection',
            target_resource_id: connection.id,
            metadata: {
              tool_name: action.action_id,
              call_id: request.call_id,
              payload_hash: payloadHash,
              result_hash: hashPayload(result.result ?? {}),
            },
          });
      });
      finished = true;
      return result;
    } catch (error) {
      const failureCode =
        error instanceof DomainError
          ? error.code
          : invoked && writeAction
            ? 'tool_outcome_unknown'
            : 'gateway_unavailable';
      if (
        reservationId &&
        !finished &&
        (!invoked || (error instanceof ToolGatewayError && error.safe_to_retry))
      )
        await this.deps.state.releaseUnexecuted(reservationId);
      if (
        reservationId &&
        !finished &&
        invoked &&
        !(error instanceof ToolGatewayError && error.safe_to_retry)
      ) {
        await this.deps.state.finish(reservationId, {
          status: 'error',
          error_code: failureCode,
        });
      }
      await this.deps.audit.log({
        action: 'connection.tool_denied',
        context,
        actor: { type: 'specialist', id: claims.agent_slug },
        on_behalf_of_user_id: claims.user_id,
        run_id: claims.run_id,
        outcome: 'denied',
        reason_code: failureCode,
        metadata: {
          tool_name: request.tool_name,
          call_id: request.call_id,
          payload_hash: payloadHash,
        },
      });
      if (invoked && writeAction && !(error instanceof DomainError))
        throw new ToolGatewayError('tool_outcome_unknown', 503);
      throw error;
    }
  }

  private async call(
    claims: GatewayContext,
    context: RequestContext,
    request: GatewayRequest,
    connection: ConnectionEntity,
    action: ActionDefinition,
    payloadHash: string,
    onInvoke: () => void,
  ): Promise<GatewayResponse> {
    const connectionId = connection.id;
    if (!(await this.deps.state.takeRateSlot(claims.tenant_id, connectionId, action.provider_id)))
      throw new ToolGatewayError('rate_limited', 429);
    if (
      !this.deps.registry.isEgressAllowed(
        action.provider_id,
        this.deps.executor.endpoint(action.action_id),
      )
    )
      throw new ToolGatewayError('egress_denied');
    const resolved = await this.deps.credentials.forConnection(claims.tenant_id, connectionId);
    if (
      resolved.connection.external_account_id !== connection.external_account_id ||
      resolved.connection.workspace_id !== claims.tenant_id ||
      resolved.connection.provider_id !== action.provider_id
    )
      throw new ToolGatewayError('approval_payload_mismatch', 409);
    const { credentials } = resolved;
    // The durable audit admission must exist before the network can produce a side effect.
    await this.deps.audit.log({
      action: 'connection.tool_called',
      context,
      actor: { type: 'specialist', id: claims.agent_slug },
      on_behalf_of_user_id: claims.user_id,
      run_id: claims.run_id,
      outcome: 'allowed',
      target_resource_type: 'connection',
      target_resource_id: connectionId,
      metadata: {
        tool_name: action.action_id,
        call_id: request.call_id,
        payload_hash: payloadHash,
        mode: request.mode,
      },
    });
    let raw: Record<string, unknown>;
    onInvoke();
    try {
      raw = await this.deps.executor.execute(
        action.action_id,
        request.arguments,
        credentials,
        `${claims.tenant_id}:${claims.user_id}:${request.run_id}:${request.idempotency_key ?? request.call_id}`,
        {
          external_account_id: resolved.connection.external_account_id,
          account_label: resolved.connection.account_label,
        },
      );
    } catch (error) {
      if (error instanceof ToolResultTruncatedError) {
        if (action.side_effect !== 'read') throw new ToolGatewayError('tool_outcome_unknown', 503);
        return {
          status: 'ok',
          error_code: null,
          result: {
            truncated: true,
            error_code: 'response_truncated',
            limit_bytes: error.limit_bytes,
            untrusted: true,
          },
        };
      }
      throw error;
    }
    const parsed = action.output_schema.safeParse(raw);
    if (!parsed.success)
      throw new ToolGatewayError(
        action.side_effect === 'read' ? 'provider_unavailable' : 'tool_outcome_unknown',
        action.side_effect === 'read' ? 502 : 503,
      );
    const redacted = this.deps.redact(parsed.data as Record<string, unknown>, credentials);
    const serialized = JSON.stringify(redacted);
    const result =
      Buffer.byteLength(serialized) > action.max_response_bytes
        ? {
            truncated: true,
            error_code: 'response_truncated',
            original_bytes: Buffer.byteLength(serialized),
          }
        : redacted;
    return { status: 'ok', result: { ...result, untrusted: true }, error_code: null };
  }

  private preview(
    action: ActionDefinition,
    args: Record<string, unknown>,
    locale: string,
  ): Record<string, unknown> {
    const template =
      locale === 'id' ? action.approval_sentence_template.id : action.approval_sentence_template.en;
    const sentence = template.replace(/\{([a-z_]+)\}/g, (_, key: string) => {
      const value = args[key];
      return typeof value === 'string' ? value : Array.isArray(value) ? value.join(', ') : '';
    });
    return {
      simulated: true,
      action: action.action_id,
      sentence,
      ...(Array.isArray(args.to) ? { to: args.to } : {}),
    };
  }
}
