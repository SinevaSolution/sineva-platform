import { randomUUID } from 'node:crypto';
import type { CreateSquadMessageDto } from '@/server/application/dtos/squad_dto';
import {
  assertCanTakeTurn,
  loadOpenSquad,
  loadOwnedSession,
  type SquadChatDeps,
} from '@/server/application/squads/squad_chat_support';
import type { RequestContext } from '@/server/domain/context/request_context';
import { ValidationError } from '@/server/domain/errors/domain_error';
import { parseMentions } from '@/server/domain/chat/mention_parser';
import { leadSlugOf, memberSlugs, turnCeilingPoints } from '@/server/domain/squads/squad';

export interface CreateSquadMessageResult {
  message_id: string;
  run_id: string;
  conversation_id: string;
  status: string;
  /** "Up to N points" for a lead-routed turn; null for a direct @SinoX (FR-BILL-05). */
  ceiling_points: number | null;
}

export class CreateSquadMessageUseCase {
  constructor(
    private readonly deps: Pick<SquadChatDeps, 'squads' | 'directory' | 'conversations' | 'messages'>,
  ) {}

  /**
   * Stores the person's message and allocates the run handle, exactly like the
   * Hub; the browser then attaches to the shared run stream (ADR-0044).
   * Mentions are re-parsed from the text here, never taken from the client
   * (FR-HUB-08). Access, the squad's state and who may be addressed are
   * decided before anything is stored.
   */
  async execute(
    squadId: string,
    sessionId: string,
    dto: CreateSquadMessageDto,
    context: RequestContext,
  ): Promise<CreateSquadMessageResult> {
    const { conversations, messages } = this.deps;
    const squad = await loadOpenSquad(this.deps, context, squadId);
    const conversation = await loadOwnedSession(this.deps, context, squad.id, sessionId);

    if (dto.client_message_id) {
      const existing = await messages.findByClientMessageId(conversation.id, dto.client_message_id);
      if (existing) {
        return {
          message_id: existing.id,
          run_id: existing.run_id ?? '',
          conversation_id: conversation.id,
          status: existing.status,
          ceiling_points: existing.agent_slug === leadSlugOf(squad) ? turnCeilingPoints(squad) : null,
        };
      }
    }

    await assertCanTakeTurn(this.deps, squad, context);

    const parsed = parseMentions(dto.content);
    const lead = leadSlugOf(squad);
    const members = memberSlugs(squad);
    const direct = parsed.leadingSpecialistSlug;
    // A leading @mention goes straight to that member. Sino, the lead, or a
    // specialist outside the squad cannot be addressed that way: the calm
    // "not in this squad" message names no one's data.
    if (direct && direct !== lead && !members.includes(direct)) {
      throw new ValidationError('That specialist is not in this squad', [
        { code: 'mention_not_in_squad', field: 'content', detail: 'That specialist is not in this squad' },
      ]);
    }
    const target = direct && members.includes(direct) && direct !== lead ? direct : lead;

    const runId = `run_${randomUUID()}`;
    const message = await messages.create({
      conversation_id: conversation.id,
      role: 'user',
      agent_slug: target,
      content: dto.content,
      mentions: parsed.mentions,
      status: 'completed',
      run_id: runId,
      channel: 'web',
      client_message_id: dto.client_message_id ?? null,
    });
    await conversations.updateLastMessageAt(conversation.id, new Date());

    return {
      message_id: message.id,
      run_id: runId,
      conversation_id: conversation.id,
      status: message.status,
      ceiling_points: target === lead ? turnCeilingPoints(squad) : null,
    };
  }
}
