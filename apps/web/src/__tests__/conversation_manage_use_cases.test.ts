import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { CountingAuditLogger } from '@/server/domain/audit/audit_logger';
import type { RequestContext } from '@/server/domain/context/request_context';
import type { ConversationEntity } from '@/server/domain/entities/conversation';
import { DomainError, NotFoundError } from '@/server/domain/errors/domain_error';
import type { RunRelayLog } from '@/server/domain/chat/run_relay_log';
import { RenameConversationUseCase } from '@/server/application/use-cases/chat/rename_conversation_use_case';
import { DeleteConversationUseCase } from '@/server/application/use-cases/chat/delete_conversation_use_case';
import { RenameConversationSchema } from '@/server/application/dtos/conversation_dto';
import {
  InMemoryChatRuns,
  InMemoryConversations,
  InMemoryMessages,
} from './fakes/in_memory_chat_store';
import { FakeTransactionRunner } from './fakes/fake_transaction_runner';

const WS_A = '11111111-1111-4111-8111-111111111111';
const WS_B = '22222222-2222-4222-8222-222222222222';
const CONVERSATION_ID = '33333333-3333-4333-8333-333333333333';

function ctx(user: string, workspace: string): RequestContext {
  return {
    user_id: user,
    workspace_id: workspace,
    session_id: `sess-${user}`,
    request_id: `req-${user}`,
    actor: { type: 'user', id: user },
  };
}

const owner = ctx('user-alpha', WS_A);
const otherMember = ctx('user-bravo', WS_A);
const otherWorkspace = ctx('user-alpha', WS_B);

function conversation(overrides: Partial<ConversationEntity> = {}): ConversationEntity {
  const now = new Date().toISOString();
  return {
    id: CONVERSATION_ID,
    workspace_id: WS_A,
    user_id: 'user-alpha',
    kind: 'hub',
    agent_slug: null,
    title: 'Quarterly numbers',
    title_source: 'auto',
    pinned_at: null,
    archived_at: null,
    origin_message_id: null,
    origin_channel: 'web',
    last_message_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

describe('RenameConversationSchema', () => {
  it('trims the title', () => {
    expect(RenameConversationSchema.parse({ title: '  Plan  ' }).title).toBe('Plan');
  });

  it('rejects empty, whitespace-only and over-long titles', () => {
    expect(RenameConversationSchema.safeParse({ title: '' }).success).toBe(false);
    expect(RenameConversationSchema.safeParse({ title: '   ' }).success).toBe(false);
    expect(RenameConversationSchema.safeParse({ title: 'x'.repeat(121) }).success).toBe(false);
    expect(RenameConversationSchema.safeParse({ title: 'x'.repeat(120) }).success).toBe(true);
    expect(RenameConversationSchema.safeParse({}).success).toBe(false);
  });
});

describe('RenameConversationUseCase', () => {
  let conversations: InMemoryConversations;
  let audit: CountingAuditLogger;
  let useCase: RenameConversationUseCase;

  beforeEach(() => {
    conversations = new InMemoryConversations();
    conversations.rows.set(CONVERSATION_ID, conversation());
    audit = new CountingAuditLogger();
    useCase = new RenameConversationUseCase(conversations, audit);
  });

  it('lets the owner rename and marks the title as the user own', async () => {
    const result = await useCase.execute(CONVERSATION_ID, { title: 'Budget 2027' }, owner);
    expect(result.title).toBe('Budget 2027');
    expect(result.title_source).toBe('user');
    expect(conversations.rows.get(CONVERSATION_ID)?.title_source).toBe('user');
  });

  it('audits ids and field names only, never the title', async () => {
    await useCase.execute(CONVERSATION_ID, { title: 'Secret salary plan' }, owner);
    const [event] = audit.getEvents();
    expect(event).toMatchObject({
      action: 'conversation.renamed',
      target_resource_type: 'conversation',
      target_resource_id: CONVERSATION_ID,
    });
    expect(JSON.stringify(event)).not.toContain('Secret salary plan');
    expect(JSON.stringify(event)).not.toContain('Quarterly numbers');
  });

  it.each([
    ['another member of the same workspace', otherMember],
    ['the same user in another workspace', otherWorkspace],
  ])('answers 404 for %s and changes nothing', async (_label, context) => {
    await expect(useCase.execute(CONVERSATION_ID, { title: 'Hijack' }, context)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(conversations.rows.get(CONVERSATION_ID)?.title).toBe('Quarterly numbers');
    expect(audit.getEventCount()).toBe(0);
  });

  it('answers 404 for an unknown conversation', async () => {
    await expect(
      useCase.execute('44444444-4444-4444-8444-444444444444', { title: 'x' }, owner),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('writes the rename and its audit row in one transaction', async () => {
    const transactions = new FakeTransactionRunner();
    const failing = new CountingAuditLogger();
    vi.spyOn(failing, 'log').mockRejectedValue(new Error('audit down'));
    const guarded = new RenameConversationUseCase(conversations, failing, transactions);
    await expect(guarded.execute(CONVERSATION_ID, { title: 'New' }, owner)).rejects.toThrow('audit down');
    expect(transactions.runs).toBe(1);
    expect(transactions.rollbacks).toBe(1);
  });
});

describe('DeleteConversationUseCase', () => {
  let conversations: InMemoryConversations;
  let messages: InMemoryMessages;
  let chatRuns: InMemoryChatRuns;
  let audit: CountingAuditLogger;
  let cancelRun: { execute: Mock<(handle: string, context: RequestContext) => Promise<unknown>> };
  let log: { failed: Mock<RunRelayLog['failed']> };
  let transactions: FakeTransactionRunner;
  let useCase: DeleteConversationUseCase;

  async function seedTurn(handle: string, status: 'pending' | 'streaming' | 'completed') {
    const user = await messages.create({
      conversation_id: CONVERSATION_ID,
      role: 'user',
      content: 'private question text',
      run_id: handle,
    });
    const run = await chatRuns.findOrCreate({
      workspace_id: WS_A,
      conversation_id: CONVERSATION_ID,
      user_message_id: user.id,
      run_handle: handle,
      agent_slug: 'sino',
    });
    chatRuns.rows.get(handle)!.status = status;
    await messages.create({
      conversation_id: CONVERSATION_ID,
      role: 'assistant',
      content: 'private answer text',
      run_id: handle,
    });
    return run;
  }

  beforeEach(async () => {
    conversations = new InMemoryConversations();
    messages = new InMemoryMessages();
    chatRuns = new InMemoryChatRuns();
    conversations.rows.set(CONVERSATION_ID, conversation());
    // Stands in for the foreign keys' ON DELETE CASCADE.
    conversations.cascades.push((id) => {
      for (let i = messages.rows.length - 1; i >= 0; i -= 1) {
        if (messages.rows[i]!.conversation_id === id) messages.rows.splice(i, 1);
      }
      for (const [handle, run] of chatRuns.rows) {
        if (run.conversation_id === id) chatRuns.rows.delete(handle);
      }
    });
    audit = new CountingAuditLogger();
    cancelRun = { execute: vi.fn(async () => ({ status: 'cancelling' })) };
    log = { failed: vi.fn() };
    transactions = new FakeTransactionRunner();
    useCase = new DeleteConversationUseCase({
      conversations,
      messages,
      chatRuns,
      cancelRun,
      audit,
      log,
      transactions,
    });
    await seedTurn('run_done', 'completed');
  });

  it('removes the conversation, its messages and its runs', async () => {
    await useCase.execute(CONVERSATION_ID, owner);
    expect(conversations.rows.has(CONVERSATION_ID)).toBe(false);
    expect(messages.rows).toHaveLength(0);
    expect(chatRuns.rows.size).toBe(0);
  });

  it('audits ids and counts only, never text', async () => {
    await useCase.execute(CONVERSATION_ID, owner);
    const [event] = audit.getEvents();
    expect(event).toMatchObject({
      action: 'conversation.deleted',
      target_resource_type: 'conversation',
      target_resource_id: CONVERSATION_ID,
      metadata: { kind: 'hub', message_count: 2, run_count: 1 },
    });
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain('private question text');
    expect(serialized).not.toContain('private answer text');
    expect(serialized).not.toContain('Quarterly numbers');
  });

  it('cancels every active run before deleting, and leaves finished runs alone', async () => {
    await seedTurn('run_live', 'streaming');
    await seedTurn('run_wait', 'pending');
    const order: string[] = [];
    cancelRun.execute.mockImplementation(async (handle: string) => {
      // The conversation must still exist while the cancel runs.
      order.push(`cancel:${handle}:${conversations.rows.has(CONVERSATION_ID) ? 'present' : 'gone'}`);
    });
    await useCase.execute(CONVERSATION_ID, owner);
    expect(order.sort()).toEqual(['cancel:run_live:present', 'cancel:run_wait:present']);
    expect(conversations.rows.has(CONVERSATION_ID)).toBe(false);
  });

  it('still deletes when the cancel is refused, and reports the failure', async () => {
    await seedTurn('run_live', 'streaming');
    cancelRun.execute.mockRejectedValue(
      new DomainError({ message: 'cannot stop', code: 'run_not_cancellable', status: 409 }),
    );
    await useCase.execute(CONVERSATION_ID, owner);
    expect(conversations.rows.has(CONVERSATION_ID)).toBe(false);
    expect(log.failed).toHaveBeenCalledWith(
      'cancel_before_delete_failed',
      expect.objectContaining({ run_handle: 'run_live' }),
    );
  });

  it('does not swallow an unexpected cancel failure', async () => {
    await seedTurn('run_live', 'streaming');
    cancelRun.execute.mockRejectedValue(new Error('boom'));
    await expect(useCase.execute(CONVERSATION_ID, owner)).rejects.toThrow('boom');
    expect(conversations.rows.has(CONVERSATION_ID)).toBe(true);
  });

  it.each([
    ['another member of the same workspace', otherMember],
    ['the same user in another workspace', otherWorkspace],
  ])('answers 404 for %s and deletes nothing', async (_label, context) => {
    await expect(useCase.execute(CONVERSATION_ID, context)).rejects.toBeInstanceOf(NotFoundError);
    expect(conversations.rows.has(CONVERSATION_ID)).toBe(true);
    expect(messages.rows).toHaveLength(2);
    expect(cancelRun.execute).not.toHaveBeenCalled();
    expect(audit.getEventCount()).toBe(0);
  });

  it('counts, audits and deletes inside one transaction', async () => {
    await useCase.execute(CONVERSATION_ID, owner);
    expect(transactions.runs).toBe(1);
  });

  it('keeps the conversation when the audit write fails', async () => {
    vi.spyOn(audit, 'log').mockRejectedValue(new Error('audit down'));
    // The fake runner only undoes registered steps; the use case must audit
    // before it deletes so a failed audit leaves the data in place.
    await expect(useCase.execute(CONVERSATION_ID, owner)).rejects.toThrow('audit down');
    expect(conversations.rows.has(CONVERSATION_ID)).toBe(true);
  });
});
