import { describe, expect, it, vi } from 'vitest';
import { Prisma, type PrismaClient } from '@/server/infrastructure/database/generated/client';
import { PrismaChatRunRepository } from '@/server/infrastructure/database/prisma_chat_run_repository';

const row = {
  id: 'run-row-1',
  workspace_id: 'ws-1',
  conversation_id: 'conv-1',
  user_message_id: 'msg-1',
  run_handle: 'run_abc',
  agent_slug: 'sinohelp',
  status: 'pending',
  upstream_run_id: null,
  upstream_session_id: null,
  assistant_message_id: null,
  error_code: null,
  created_at: new Date('2026-10-22T00:00:00Z'),
  updated_at: new Date('2026-10-22T00:00:00Z'),
};

const input = {
  workspace_id: 'ws-1',
  conversation_id: 'conv-1',
  user_message_id: 'msg-1',
  run_handle: 'run_abc',
  agent_slug: 'sinohelp',
};

describe('PrismaChatRunRepository.findOrCreate under a concurrent first attach', () => {
  it('returns the row the other caller created when the insert loses the unique race', async () => {
    const chatRun = {
      upsert: vi.fn().mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '7.10.1',
        }),
      ),
      findUniqueOrThrow: vi.fn().mockResolvedValue(row),
    };
    const repo = new PrismaChatRunRepository({ chatRun } as unknown as PrismaClient);

    const run = await repo.findOrCreate(input);

    expect(run.id).toBe('run-row-1');
    expect(chatRun.findUniqueOrThrow).toHaveBeenCalledWith({ where: { run_handle: 'run_abc' } });
  });

  it('still throws any other database error', async () => {
    const chatRun = {
      upsert: vi.fn().mockRejectedValue(new Error('connection lost')),
      findUniqueOrThrow: vi.fn(),
    };
    const repo = new PrismaChatRunRepository({ chatRun } as unknown as PrismaClient);

    await expect(repo.findOrCreate(input)).rejects.toThrow('connection lost');
    expect(chatRun.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
