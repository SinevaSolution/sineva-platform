import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaMessageCardRepository } from '@/server/infrastructure/database/prisma_message_card_repository';
import { PrismaMessageRepository } from '@/server/infrastructure/database/prisma_message_repository';
import { createPrismaClient } from '@/server/infrastructure/database/prisma_client';
import type { NewMessageCard } from '@/server/domain/repositories/message_card_repository';

const prisma = createPrismaClient(process.env.TEST_DATABASE_URL!);
const cards = new PrismaMessageCardRepository(prisma);
const messages = new PrismaMessageRepository(prisma);

let seed: { workspace_id: string; other_workspace_id: string; conversation_id: string; message_id: string };

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  const user = await prisma.user.create({ data: { email: 'card@sineva.id', full_name: 'Card Owner' } });
  const workspace = await prisma.workspace.create({
    data: { workspace_slug: 'card-corp', workspace_name: 'Card Corp', owner_user_id: user.id },
  });
  const other = await prisma.workspace.create({
    data: { workspace_slug: 'other-corp', workspace_name: 'Other Corp', owner_user_id: user.id },
  });
  const conversation = await prisma.conversation.create({
    data: { workspace_id: workspace.id, user_id: user.id, kind: 'hub' },
  });
  const message = await messages.create({
    conversation_id: conversation.id,
    role: 'assistant',
    content: 'Here is a card',
  });
  seed = {
    workspace_id: workspace.id,
    other_workspace_id: other.id,
    conversation_id: conversation.id,
    message_id: message.id,
  };
});

function card(position: number, over: Partial<NewMessageCard> = {}): NewMessageCard {
  return {
    message_id: seed.message_id,
    conversation_id: seed.conversation_id,
    workspace_id: seed.workspace_id,
    run_id: 'run_int-1',
    call_id: null,
    position,
    card_type: 'guardrail_notice',
    schema_version: 1,
    state: 'ready',
    provider_slug: null,
    connection_id: null,
    approval_id: null,
    data: { specialist: 'sinofinance', limit_key: 'no_money_moves', offer_key: 'prepare_details' },
    actions: [{ id: 'prepare', kind: 'send_to_chat', label_key: 'cards.guardrail.prepare' }],
    fallback_text: 'I cannot move money.',
    payload_hash: 'a'.repeat(64),
    validation_status: 'valid',
    rejected_code: null,
    search_text: 'I cannot move money.',
    data_expires_at: null,
    ...over,
  };
}

describe('PrismaMessageCardRepository (WP-M0-32, ADR-0025)', () => {
  it('round-trips a card with jsonb data and actions and a UUID id', async () => {
    const [created] = await cards.createMany([card(0)]);
    expect(created!.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created!.version).toBe(1);

    const listed = await cards.listByMessageIds(seed.workspace_id, [seed.message_id]);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      card_type: 'guardrail_notice',
      schema_version: 1,
      state: 'ready',
      validation_status: 'valid',
      data: { specialist: 'sinofinance', limit_key: 'no_money_moves', offer_key: 'prepare_details' },
      actions: [{ id: 'prepare', kind: 'send_to_chat', label_key: 'cards.guardrail.prepare' }],
      fallback_text: 'I cannot move money.',
    });
  });

  it('keeps the code only on a rejected card (data stays empty)', async () => {
    await cards.createMany([
      card(0, {
        card_type: 'runway_metrics',
        schema_version: 1,
        state: 'failed',
        data: {},
        actions: [],
        payload_hash: null,
        validation_status: 'rejected',
        rejected_code: 'unknown_card_type',
      }),
    ]);
    const [row] = await cards.listByMessageIds(seed.workspace_id, [seed.message_id]);
    expect(row).toMatchObject({
      validation_status: 'rejected',
      rejected_code: 'unknown_card_type',
      data: {},
      payload_hash: null,
    });
  });

  it('lists in position order', async () => {
    await cards.createMany([card(2), card(0), card(1)]);
    const listed = await cards.listByMessageIds(seed.workspace_id, [seed.message_id]);
    expect(listed.map((c) => c.position)).toEqual([0, 1, 2]);
  });

  it('is scoped by workspace: another tenant sees nothing for the same message id', async () => {
    await cards.createMany([card(0)]);
    expect(await cards.listByMessageIds(seed.other_workspace_id, [seed.message_id])).toEqual([]);
  });

  it('stores nothing when one card of the batch violates (message_id, position)', async () => {
    await expect(cards.createMany([card(0), card(0)])).rejects.toThrow();
    expect(await cards.listByMessageIds(seed.workspace_id, [seed.message_id])).toEqual([]);
  });

  it('cascades when the message is deleted', async () => {
    await cards.createMany([card(0)]);
    await prisma.message.delete({ where: { id: seed.message_id } });
    expect(await cards.listByMessageIds(seed.workspace_id, [seed.message_id])).toEqual([]);
  });

  it('cascades when the conversation is deleted (conversation delete reaches cards, FR-AX-52)', async () => {
    await cards.createMany([card(0)]);
    await prisma.conversation.delete({ where: { id: seed.conversation_id } });
    expect(await prisma.messageCard.count()).toBe(0);
  });

  it('stores data_expires_at as timestamptz', async () => {
    await cards.createMany([card(0, { data_expires_at: '2026-11-21T00:00:00.000Z' })]);
    const [row] = await cards.listByMessageIds(seed.workspace_id, [seed.message_id]);
    expect(row!.data_expires_at).toBe('2026-11-21T00:00:00.000Z');
  });
});
