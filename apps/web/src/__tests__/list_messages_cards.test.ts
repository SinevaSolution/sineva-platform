import { describe, expect, it } from 'vitest';
import { ListMessagesUseCase } from '@/server/application/use-cases/chat/list_messages_use_case';
import type { CardCheck, CardValidator } from '@/server/domain/chat/card_validator';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { MessageEntity } from '@/server/domain/entities/message';
import type { MessageCardEntity } from '@/server/domain/entities/message_card';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import { CardSchemaValidator } from '@/server/infrastructure/cards/card_schema_validator';
import { InMemoryConversations, InMemoryMessageCards } from './fakes/in_memory_chat_store';

const WS = '11111111-1111-4111-8111-111111111111';
const OTHER_WS = '22222222-2222-4222-8222-222222222222';
const CONV = '33333333-3333-4333-8333-333333333333';
const USER = 'user-alpha';

const context: RequestContext = {
  user_id: USER,
  workspace_id: WS,
  session_id: 's',
  request_id: 'r',
  actor: { type: 'user', id: USER },
};

function message(id: string, role: 'user' | 'assistant'): MessageEntity {
  return {
    id,
    conversation_id: CONV,
    role,
    agent_slug: null,
    content: `text ${id}`,
    mentions: null,
    status: 'completed',
    finish_reason: null,
    run_id: null,
    channel: 'web',
    client_message_id: null,
    created_at: '2026-10-22T00:00:00.000Z',
    updated_at: '2026-10-22T00:00:00.000Z',
  };
}

function cardRow(messageId: string, position: number, over: Partial<MessageCardEntity> = {}): MessageCardEntity {
  return {
    id: `card-${messageId}-${position}`,
    message_id: messageId,
    conversation_id: CONV,
    workspace_id: WS,
    run_id: 'run_1',
    call_id: null,
    position,
    card_type: 'guardrail_notice',
    schema_version: 1,
    state: 'ready',
    provider_slug: null,
    connection_id: null,
    approval_id: null,
    data: { specialist: 'sinofinance', limit_key: 'no_money_moves', offer_key: 'prepare_details' },
    actions: [],
    fallback_text: 'I cannot move money.',
    payload_hash: 'a'.repeat(64),
    validation_status: 'valid',
    rejected_code: null,
    search_text: null,
    version: 1,
    data_expires_at: null,
    created_at: '2026-10-22T00:00:00.000Z',
    updated_at: '2026-10-22T00:00:00.000Z',
    ...over,
  };
}

async function setup(validator: CardValidator = new CardSchemaValidator()) {
  const conversations = new InMemoryConversations();
  conversations.rows.set(CONV, {
    id: CONV,
    workspace_id: WS,
    user_id: USER,
    kind: 'hub',
    agent_slug: null,
    title: null,
    title_source: null,
    pinned_at: null,
    archived_at: null,
    origin_message_id: null,
    origin_channel: 'web',
    last_message_at: null,
    created_at: '2026-10-22T00:00:00.000Z',
    updated_at: '2026-10-22T00:00:00.000Z',
  });
  const items = [message('m1', 'user'), message('m2', 'assistant'), message('m3', 'assistant')];
  const messages = {
    create: async () => {
      throw new Error('unused');
    },
    findByClientMessageId: async () => null,
    findUserMessageByRunId: async () => null,
    listByConversation: async () => ({ items, next_cursor: null }),
  };
  const cards = new InMemoryMessageCards();
  const useCase = new ListMessagesUseCase(conversations, messages, cards, validator);
  return { useCase, cards };
}

describe('ListMessagesUseCase cards (WP-M0-32, FR-AX-13, FR-AX-52)', () => {
  it('attaches each message its cards in position order and gives every message a cards array', async () => {
    const { useCase, cards } = await setup();
    await cards.createMany([cardRow('m2', 1), cardRow('m2', 0), cardRow('m3', 0)]);

    const { items } = await useCase.execute(CONV, { limit: 50 }, context);

    expect(items.map((m) => m.cards.length)).toEqual([0, 2, 1]);
    expect(items[1]!.cards.map((c) => c.position)).toEqual([0, 1]);
    expect(items[1]!.cards[0]).toMatchObject({
      message_id: 'm2',
      card_type: 'guardrail_notice',
      schema_version: 1,
      state: 'ready',
      validation_status: 'valid',
      fallback_text: 'I cannot move money.',
    });
  });

  it('does not expose internal columns (workspace, hash, search text, run, connection)', async () => {
    const { useCase, cards } = await setup();
    await cards.createMany([cardRow('m2', 0)]);
    const { items } = await useCase.execute(CONV, { limit: 50 }, context);
    expect(Object.keys(items[1]!.cards[0]!).sort()).toEqual(
      [
        'actions',
        'approval_id',
        'card_type',
        'data',
        'fallback_text',
        'id',
        'message_id',
        'position',
        'provider_slug',
        'rejected_code',
        'schema_version',
        'state',
        'validation_status',
        'version',
      ].sort(),
    );
  });

  it('never returns a card of another workspace for the same message id', async () => {
    const { useCase, cards } = await setup();
    await cards.createMany([cardRow('m2', 0, { workspace_id: OTHER_WS })]);
    const { items } = await useCase.execute(CONV, { limit: 50 }, context);
    expect(items[1]!.cards).toEqual([]);
  });

  it('returns a rejected card as its code and fallback text with empty data', async () => {
    const { useCase, cards } = await setup();
    await cards.createMany([
      cardRow('m2', 0, {
        card_type: 'runway_metrics',
        state: 'failed',
        data: {},
        validation_status: 'rejected',
        rejected_code: 'unknown_card_type',
        payload_hash: null,
      }),
    ]);
    const { items } = await useCase.execute(CONV, { limit: 50 }, context);
    expect(items[1]!.cards[0]).toMatchObject({
      validation_status: 'rejected',
      rejected_code: 'unknown_card_type',
      data: {},
      fallback_text: 'I cannot move money.',
    });
  });

  it('upcasts a stored N-1 card on read through the validator', async () => {
    const upcasting: CardValidator = {
      supports: () => true,
      validate: (display): CardCheck => {
        const d = display as { schema_version: number; fallback_text: string };
        return {
          ok: true,
          card: {
            card_type: 'guardrail_notice',
            schema_version: d.schema_version + 1,
            data: { upcast: true },
            actions: [],
            provider: null,
            fallback_text: d.fallback_text,
            payload_hash: 'b'.repeat(64),
            data_expires_at: null,
          },
        };
      },
    };
    const { useCase, cards } = await setup(upcasting);
    await cards.createMany([cardRow('m2', 0)]);
    const { items } = await useCase.execute(CONV, { limit: 50 }, context);
    expect(items[1]!.cards[0]).toMatchObject({
      schema_version: 2,
      data: { upcast: true },
      validation_status: 'valid',
    });
  });

  it('shows a stored card that no longer validates as rejected with its fallback text, never as a card', async () => {
    const { useCase, cards } = await setup();
    await cards.createMany([cardRow('m2', 0, { schema_version: 9 })]);
    const { items } = await useCase.execute(CONV, { limit: 50 }, context);
    expect(items[1]!.cards[0]).toMatchObject({
      validation_status: 'rejected',
      rejected_code: 'unsupported_version',
      data: {},
      fallback_text: 'I cannot move money.',
    });
  });

  it('keeps the 404 for a conversation the caller does not own, before reading any card', async () => {
    const { useCase } = await setup();
    await expect(
      useCase.execute(CONV, { limit: 50 }, { ...context, user_id: 'someone-else' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
