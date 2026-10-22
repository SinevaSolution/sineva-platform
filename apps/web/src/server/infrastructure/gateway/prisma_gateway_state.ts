import 'server-only';
import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@/server/infrastructure/database/generated/client';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { GatewayContext } from '@/server/domain/toolgateway/gateway_context';
import type {
  ApprovedGatewayCall,
  GatewayRequest,
  GatewayResponse,
  GatewayState,
} from '@/server/domain/toolgateway/gateway_ports';
import { hashPayload } from '@/server/domain/approvals/action_types';
import { gatewayApprovalPayloadSchema } from '@/server/domain/toolgateway/gmail_approval';
import { gatewayContextSchema } from './gateway_context_verifier';
import { ToolGatewayError } from '@/server/domain/toolgateway/tool_executor';
import { activeClient } from '../database/prisma_transaction_runner';

export interface ToolCallLimiter {
  take(workspaceId: string, connectionId: string, providerId: string): Promise<boolean>;
}
const digest = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

export class PrismaGatewayState implements GatewayState {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly limiter: ToolCallLimiter,
  ) {}
  private get db() {
    return activeClient(this.prisma);
  }

  async authorize(claims: GatewayContext): Promise<RequestContext> {
    const [member, run] = await Promise.all([
      this.db.workspaceMember.findUnique({
        where: {
          workspace_id_user_id: { workspace_id: claims.tenant_id, user_id: claims.user_id },
        },
        include: { user: true, specialists: true },
      }),
      this.db.chatRun.findFirst({
        where: { run_handle: claims.run_id, workspace_id: claims.tenant_id },
        include: { conversation: true, workspace: true },
      }),
    ]);
    if (
      !member ||
      !run ||
      member.user.status !== 'active' ||
      !member.user.email_verified ||
      run.conversation.user_id !== claims.user_id ||
      run.conversation.workspace_id !== claims.tenant_id ||
      run.agent_slug !== claims.agent_slug
    )
      throw new ToolGatewayError('action_not_allowed');
    if (
      !['active', 'trialing', 'past_due', 'read_only'].includes(run.workspace.status) ||
      !['streaming', 'needs_approval', 'pending'].includes(run.status)
    )
      throw new ToolGatewayError('action_not_allowed');
    if (!['owner', 'admin', 'member'].includes(member.role))
      throw new ToolGatewayError('action_not_allowed');
    if (
      member.specialist_scope === 'selected' &&
      !member.specialists.some((s) => s.agent_slug === claims.agent_slug)
    )
      throw new ToolGatewayError('action_not_allowed');
    return {
      user_id: claims.user_id,
      workspace_id: claims.tenant_id,
      role: member.role as RequestContext['role'],
      session_id: 'internal:tool-gateway',
      request_id: claims.request_id,
      actor: { type: 'user', id: claims.user_id },
    };
  }

  async isBlocked(
    workspaceId: string,
    providerId: string,
    agentSlug: string,
    write: boolean,
  ): Promise<boolean> {
    const blocked = await this.db.killSwitch.findFirst({
      where: {
        enabled: true,
        OR: [
          { scope: 'freeze', target: { in: [workspaceId, '*'] } },
          { scope: 'provider', target: { in: [providerId, '*'] } },
          { scope: 'specialist', target: { in: [agentSlug, `${workspaceId}:${agentSlug}`, '*'] } },
          ...(write ? [{ scope: 'read_only', target: { in: [workspaceId, '*'] } }] : []),
        ],
      },
    });
    if (blocked) return true;
    if (write) {
      const workspace = await this.db.workspace.findUnique({
        where: { id: workspaceId },
        select: { status: true },
      });
      return !workspace || workspace.status === 'read_only';
    }
    return false;
  }

  async claim(
    context: GatewayContext,
    request: GatewayRequest,
    payloadHash: string,
    connectionId?: string,
  ): ReturnType<GatewayState['claim']> {
    const keyHash = digest(`${request.mode}:${request.idempotency_key ?? request.call_id}`);
    const identity = {
      workspace_id: context.tenant_id,
      user_id: context.user_id,
      run_id: request.run_id,
    };
    const created = await this.db.toolGatewayCall.createMany({
      data: [
        {
          ...identity,
          call_id: request.call_id,
          idempotency_hash: keyHash,
          payload_hash: payloadHash,
          tool_name: request.tool_name,
          authorization: context as unknown as Prisma.InputJsonValue,
          connection_id: connectionId ?? null,
        },
      ],
      skipDuplicates: true,
    });
    const row = await this.db.toolGatewayCall.findFirst({
      where: { ...identity, OR: [{ idempotency_hash: keyHash }, { call_id: request.call_id }] },
    });
    if (!row) throw new ToolGatewayError('dependency_unavailable', 503);
    if (row.payload_hash !== payloadHash || row.idempotency_hash !== keyHash)
      return { status: 'conflict' };
    if (created.count === 1) return { status: 'claimed', id: row.id };
    if (row.response !== null)
      return { status: 'replay', response: row.response as unknown as GatewayResponse };
    if (row && Date.now() - row.updated_at.getTime() > 120_000)
      return {
        status: 'replay',
        response: { status: 'error', error_code: 'tool_outcome_unknown' },
      };
    return { status: 'busy' };
  }

  async finish(id: string, response: GatewayResponse): Promise<void> {
    let approvalId: string | undefined;
    if (response.approval_id) {
      const call = await this.db.toolGatewayCall.findUnique({ where: { id } });
      const approval =
        call &&
        (await this.db.approval.findUnique({
          where: {
            workspace_id_upstream_approval_id: {
              workspace_id: call.workspace_id,
              upstream_approval_id: response.approval_id,
            },
          },
        }));
      if (!approval || response.approval_id !== id)
        throw new ToolGatewayError('approval_payload_mismatch', 409);
      approvalId = approval.id;
    }
    const updated = await this.db.toolGatewayCall.updateMany({
      where: { id, status: 'executing' },
      data: {
        ...(approvalId ? { approval_id: approvalId } : {}),
        status:
          response.status === 'approval_required'
            ? 'awaiting_approval'
            : response.status === 'ok'
              ? 'completed'
              : 'failed',
        response: response as unknown as Prisma.InputJsonValue,
        updated_at: new Date(),
      },
    });
    if (updated.count !== 1) throw new ToolGatewayError('tool_call_in_progress', 409);
  }

  async releaseUnexecuted(id: string): Promise<void> {
    const row = await this.db.toolGatewayCall.findUnique({ where: { id } });
    if (!row || row.status !== 'executing') return;
    if (row.approval_id) {
      await this.db.toolGatewayCall.updateMany({
        where: { id, status: 'executing' },
        data: {
          status: 'awaiting_approval',
          response: {
            status: 'approval_required',
            approval_id: id,
            error_code: 'approval_required',
          },
          updated_at: new Date(),
        },
      });
    } else {
      await this.db.toolGatewayCall.deleteMany({ where: { id, status: 'executing' } });
    }
  }

  async loadApprovalCall(
    workspaceId: string,
    approvalId: string,
    deciderId: string,
  ): Promise<ApprovedGatewayCall> {
    const approval = await this.db.approval.findFirst({
      where: {
        id: approvalId,
        workspace_id: workspaceId,
        status: 'pending',
        claimed_by: deciderId,
        claimed_decision: 'approve',
        expires_at: { gt: new Date() },
      },
    });
    if (
      !approval ||
      approval.payload_hash !== hashPayload(approval.payload as Record<string, unknown>)
    )
      throw new ToolGatewayError('approval_payload_mismatch', 409);
    const parsed = gatewayApprovalPayloadSchema.safeParse(approval.payload);
    if (!parsed.success) throw new ToolGatewayError('approval_payload_mismatch', 409);
    const row = await this.db.toolGatewayCall.findFirst({
      where: {
        id: parsed.data.gateway_call_id,
        workspace_id: workspaceId,
        approval_id: approvalId,
      },
    });
    if (
      !row ||
      !row.connection_id ||
      row.connection_id !== parsed.data.connection_id ||
      row.tool_name !== parsed.data.request.tool_name
    )
      throw new ToolGatewayError('approval_payload_mismatch', 409);
    const claims = gatewayContextSchema.safeParse(row.authorization);
    if (
      !claims.success ||
      claims.data.tenant_id !== workspaceId ||
      claims.data.user_id !== row.user_id ||
      claims.data.run_id !== row.run_id ||
      claims.data.agent_slug !== approval.agent_slug
    )
      throw new ToolGatewayError('approval_payload_mismatch', 409);
    const request = { ...parsed.data.request, idempotency_key: row.id };
    const payloadHash = hashPayload({
      tool_name: request.tool_name,
      arguments: request.arguments,
      run_id: request.run_id,
      mode: request.mode,
    });
    if (
      payloadHash !== row.payload_hash ||
      request.call_id !== row.call_id ||
      request.run_id !== row.run_id
    )
      throw new ToolGatewayError('approval_payload_mismatch', 409);
    return {
      id: row.id,
      claims: claims.data,
      request,
      connection_id: row.connection_id,
      external_account_id: parsed.data.external_account_id ?? null,
      payload_hash: row.payload_hash,
    };
  }

  async claimApproved(id: string, approvalId: string): ReturnType<GatewayState['claimApproved']> {
    const won = await this.db.toolGatewayCall.updateMany({
      where: { id, approval_id: approvalId, status: 'awaiting_approval' },
      data: { status: 'executing', response: Prisma.DbNull, updated_at: new Date() },
    });
    if (won.count === 1) return { status: 'claimed', id };
    const row = await this.db.toolGatewayCall.findFirst({ where: { id, approval_id: approvalId } });
    if (row && ['completed', 'failed'].includes(row.status) && row.response)
      return { status: 'replay', response: row.response as unknown as GatewayResponse };
    if (row && Date.now() - row.updated_at.getTime() > 120_000)
      return {
        status: 'replay',
        response: { status: 'error', error_code: 'tool_outcome_unknown' },
      };
    return { status: 'busy' };
  }

  async takeRateSlot(
    workspaceId: string,
    connectionId: string,
    providerId: string,
  ): Promise<boolean> {
    return this.limiter.take(workspaceId, connectionId, providerId);
  }
}
