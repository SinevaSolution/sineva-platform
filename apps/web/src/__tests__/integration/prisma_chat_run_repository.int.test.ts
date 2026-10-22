import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaChatRunRepository } from '@/server/infrastructure/database/prisma_chat_run_repository';
import { PrismaMessageRepository } from '@/server/infrastructure/database/prisma_message_repository';
import { createPrismaClient } from '@/server/infrastructure/database/prisma_client';

const prisma = createPrismaClient(process.env.TEST_DATABASE_URL!);
const runs = new PrismaChatRunRepository(prisma);
const messages = new PrismaMessageRepository(prisma);

let seed: { workspace_id: string; conversation_id: string; user_message_id: string };

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  const user = await prisma.user.create({ data: { email: 'run@sineva.id', full_name: 'Run Owner' } });
  const workspace = await prisma.workspace.create({
    data: { workspace_slug: 'run-corp', workspace_name: 'Run Corp', owner_user_id: user.id },
  });
  const conversation = await prisma.conversation.create({
    data: { workspace_id: workspace.id, user_id: user.id, kind: 'hub' },
  });
  const message = await messages.create({
    conversation_id: conversation.id,
    role: 'user',
    content: 'hi',
    run_id: 'run_int-1',
  });
  seed = { workspace_id: workspace.id, conversation_id: conversation.id, user_message_id: message.id };
});

const input = () => ({ ...seed, run_handle: 'run_int-1', agent_slug: 'sino' });

describe('PrismaChatRunRepository (WP-M0-30, ADR-0022)', () => {
  it('findOrCreate is idempotent on the run handle and returns a UUID id', async () => {
    const [a, b] = await Promise.all([runs.findOrCreate(input()), runs.findOrCreate(input())]);
    expect(a.id).toBe(b.id);
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.status).toBe('pending');
  });

  it('claimStart lets exactly one of two concurrent callers start the run', async () => {
    const run = await runs.findOrCreate(input());
    const results = await Promise.all([runs.claimStart(run.id), runs.claimStart(run.id)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await runs.findByHandle('run_int-1'))!.status).toBe('streaming');
  });

  it('releaseStart returns a streaming run to pending with the error code', async () => {
    const run = await runs.findOrCreate(input());
    await runs.claimStart(run.id);
    await runs.releaseStart(run.id, 'upstream_unavailable');
    expect(await runs.findByHandle('run_int-1')).toMatchObject({
      status: 'pending',
      error_code: 'upstream_unavailable',
    });
  });

  it('finalize only succeeds from an allowed status, once', async () => {
    const run = await runs.findOrCreate(input());
    expect(await runs.finalize(run.id, { from: ['streaming'], status: 'completed' })).toBe(false);
    await runs.claimStart(run.id);
    expect(await runs.finalize(run.id, { from: ['streaming'], status: 'completed' })).toBe(true);
    expect(await runs.finalize(run.id, { from: ['streaming'], status: 'error' })).toBe(false);
    expect((await runs.findByHandle('run_int-1'))!.status).toBe('completed');
  });

  it('stores upstream ids and returns the latest session for the conversation', async () => {
    const run = await runs.findOrCreate(input());
    expect(await runs.findLatestSessionId(seed.conversation_id)).toBeNull();
    await runs.recordUpstream(run.id, {
      upstream_run_id: '7b8c9d0e-1f2a-3b4c-5d6e-7f8a9b0c1d2e',
      upstream_session_id: '8f3a1c2d-6b4e-4d7a-9c15-2e0b7a41f9d3',
    });
    expect(await runs.findLatestSessionId(seed.conversation_id)).toBe(
      '8f3a1c2d-6b4e-4d7a-9c15-2e0b7a41f9d3',
    );
  });

  it('finds the user message of a handle and ignores assistant rows that share it', async () => {
    await messages.create({
      conversation_id: seed.conversation_id,
      role: 'assistant',
      content: 'reply',
      run_id: 'run_int-1',
    });
    const found = await messages.findUserMessageByRunId('run_int-1');
    expect(found?.role).toBe('user');
    expect(await messages.findUserMessageByRunId('run_missing')).toBeNull();
  });

  it('cascades chat_runs when the conversation is deleted (tenant data stays tenant-scoped)', async () => {
    await runs.findOrCreate(input());
    await prisma.conversation.delete({ where: { id: seed.conversation_id } });
    expect(await runs.findByHandle('run_int-1')).toBeNull();
  });
});
