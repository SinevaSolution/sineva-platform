import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaChatRunRepository } from '@/server/infrastructure/database/prisma_chat_run_repository';
import { PrismaConversationRepository } from '@/server/infrastructure/database/prisma_conversation_repository';
import { PrismaMessageRepository } from '@/server/infrastructure/database/prisma_message_repository';
import { PrismaTransactionRunner } from '@/server/infrastructure/database/prisma_transaction_runner';
import { createPrismaClient } from '@/server/infrastructure/database/prisma_client';

const prisma = createPrismaClient(process.env.TEST_DATABASE_URL!);
const conversations = new PrismaConversationRepository(prisma);
const messages = new PrismaMessageRepository(prisma);
const runs = new PrismaChatRunRepository(prisma);
const transactions = new PrismaTransactionRunner(prisma);

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await prisma.$disconnect();
});

async function seedConversation(email: string, slug: string) {
  const user = await prisma.user.create({ data: { email, full_name: 'Owner' } });
  const workspace = await prisma.workspace.create({
    data: { workspace_slug: slug, workspace_name: slug, owner_user_id: user.id },
  });
  const conversation = await conversations.create({
    workspace_id: workspace.id,
    user_id: user.id,
    kind: 'hub',
    title: 'Auto title',
    title_source: 'auto',
  });
  return { user, workspace, conversation };
}

async function seedTurn(seed: Awaited<ReturnType<typeof seedConversation>>, handle: string) {
  const user = await messages.create({
    conversation_id: seed.conversation.id,
    role: 'user',
    content: 'question',
    run_id: handle,
  });
  const run = await runs.findOrCreate({
    workspace_id: seed.workspace.id,
    conversation_id: seed.conversation.id,
    user_message_id: user.id,
    run_handle: handle,
    agent_slug: 'sino',
  });
  const reply = await messages.create({
    conversation_id: seed.conversation.id,
    role: 'assistant',
    content: 'answer',
    run_id: handle,
  });
  await runs.setAssistantMessage(run.id, reply.id);
}

describe('conversation rename and delete (Prisma)', () => {
  it('rename sets the title, marks it as the user own and bumps updated_at', async () => {
    const seed = await seedConversation('rename@sineva.id', 'rename-corp');
    const renamed = await conversations.rename(seed.conversation.id, 'My own name');
    expect(renamed.title).toBe('My own name');
    expect(renamed.title_source).toBe('user');
    expect(renamed.updated_at >= seed.conversation.updated_at).toBe(true);
  });

  it('delete removes the conversation, its messages and its chat runs, and nothing else', async () => {
    const mine = await seedConversation('mine@sineva.id', 'mine-corp');
    const other = await seedConversation('other@sineva.id', 'other-corp');
    await seedTurn(mine, 'run_del-1');
    await seedTurn(mine, 'run_del-2');
    await seedTurn(other, 'run_keep-1');

    await conversations.delete(mine.conversation.id);

    expect(await conversations.findById(mine.conversation.id)).toBeNull();
    expect(await messages.countByConversation(mine.conversation.id)).toBe(0);
    expect(await runs.listByConversation(mine.conversation.id)).toHaveLength(0);
    expect(await runs.findByHandle('run_del-1')).toBeNull();
    // The other conversation is untouched.
    expect(await conversations.findById(other.conversation.id)).not.toBeNull();
    expect(await messages.countByConversation(other.conversation.id)).toBe(2);
    expect(await runs.listByConversation(other.conversation.id)).toHaveLength(1);
  });

  it('deleting twice is a no-op, not an error', async () => {
    const seed = await seedConversation('twice@sineva.id', 'twice-corp');
    await conversations.delete(seed.conversation.id);
    await expect(conversations.delete(seed.conversation.id)).resolves.toBeUndefined();
  });

  it('counts and the delete join one transaction: a rollback keeps every row', async () => {
    const seed = await seedConversation('rollback@sineva.id', 'rollback-corp');
    await seedTurn(seed, 'run_rb-1');

    await expect(
      transactions.run(async () => {
        expect(await messages.countByConversation(seed.conversation.id)).toBe(2);
        await conversations.delete(seed.conversation.id);
        throw new Error('audit write failed');
      }),
    ).rejects.toThrow('audit write failed');

    expect(await conversations.findById(seed.conversation.id)).not.toBeNull();
    expect(await messages.countByConversation(seed.conversation.id)).toBe(2);
    expect(await runs.listByConversation(seed.conversation.id)).toHaveLength(1);
  });

  it('listByConversation returns the runs oldest first', async () => {
    const seed = await seedConversation('order@sineva.id', 'order-corp');
    await seedTurn(seed, 'run_o-1');
    await seedTurn(seed, 'run_o-2');
    const list = await runs.listByConversation(seed.conversation.id);
    expect(list.map((r) => r.run_handle)).toEqual(['run_o-1', 'run_o-2']);
  });
});
