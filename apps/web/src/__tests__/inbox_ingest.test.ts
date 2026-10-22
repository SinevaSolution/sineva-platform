import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { IngestRunInboxEventUseCase } from '@/server/application/use-cases/inbox/ingest_run_inbox_event_use_case';
import { CreateInboxItemUseCase } from '@/server/application/use-cases/inbox/create_inbox_item_use_case';
import {
  createApprovalRequestSchema,
  createInputRequestRequestSchema,
} from '@/server/application/inbox/approval_contract_dto';
import { CountingAuditLogger } from '@/server/domain/audit/audit_logger';
import type { ChatRunEntity } from '@/server/domain/entities/chat_run';
import type { ConversationEntity } from '@/server/domain/entities/conversation';
import { noTransaction } from '@/server/domain/transactions/transaction_runner';
import { InMemoryChatRuns, InMemoryConversations } from './fakes/in_memory_chat_store';
import { InMemoryInboxRepository } from './fakes/in_memory_inbox_repository';

const fixture = (name: string) =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, 'contract/fixtures', name), 'utf8'));

const WS = '11111111-1111-4111-8111-111111111111';
const OTHER_WS = '22222222-2222-4222-8222-222222222222';
const OWNER = 'aaaaaaaa-0000-4000-8000-000000000003';
const CONV = '33333333-3333-4333-8333-333333333333';
const HANDLE = 'run_0a1b2c3d-0000-4000-8000-000000000001';

function setup(over: Partial<ChatRunEntity> = {}) {
  const chatRuns = new InMemoryChatRuns();
  const conversations = new InMemoryConversations();
  const at = '2026-10-22T00:00:00.000Z';
  conversations.rows.set(CONV, {
    id: CONV,
    workspace_id: WS,
    user_id: OWNER,
    kind: 'hub',
    agent_slug: null,
    title: null,
    title_source: null,
    pinned_at: null,
    archived_at: null,
    origin_message_id: null,
    origin_channel: 'web',
    last_message_at: null,
    created_at: at,
    updated_at: at,
  } as ConversationEntity);
  chatRuns.rows.set(HANDLE, {
    id: 'cr-1',
    workspace_id: WS,
    conversation_id: CONV,
    user_message_id: 'm-1',
    run_handle: HANDLE,
    agent_slug: 'sinosocial',
    status: 'needs_approval',
    upstream_run_id: '7b8c9d0e-1f2a-3b4c-5d6e-7f8a9b0c1d2e',
    upstream_session_id: null,
    assistant_message_id: null,
    error_code: null,
    created_at: at,
    updated_at: at,
    ...over,
  });
  const inboxRepo = new InMemoryInboxRepository();
  const audit = new CountingAuditLogger();
  const creator = new CreateInboxItemUseCase({ inbox: inboxRepo, audit, transactions: noTransaction });
  const ingest = new IngestRunInboxEventUseCase({ chatRuns, conversations, creator });
  return { ingest, inboxRepo, audit, chatRuns };
}

describe('internal ingest of approvals and input requests (WP-M1-40, ADR-0032)', () => {
  const approvalBody = createApprovalRequestSchema.parse(fixture('approval_create_request.json'));
  const inputBody = createInputRequestRequestSchema.parse(fixture('approval_input_create_request.json'));

  it('derives the recipient and the upstream run from the platform run, never from the body', async () => {
    const { ingest, inboxRepo } = setup();
    const result = await ingest.createApproval(approvalBody, 'req-12345678');

    expect(result).toMatchObject({ created: true });
    const item = [...inboxRepo.items.values()][0]!;
    expect(item.recipient_user_id).toBe(OWNER);
    expect([...inboxRepo.approvals.values()][0]).toMatchObject({
      run_id: '7b8c9d0e-1f2a-3b4c-5d6e-7f8a9b0c1d2e',
      agent_slug: 'sinosocial',
    });
  });

  it('is idempotent and returns the same ids on a retry', async () => {
    const { ingest, inboxRepo } = setup();
    const first = await ingest.createApproval(approvalBody, 'req-12345678');
    const second = await ingest.createApproval(approvalBody, 'req-12345678');
    expect(second).toMatchObject({ created: false, approval_id: first.approval_id, inbox_item_id: first.inbox_item_id });
    expect(inboxRepo.items.size).toBe(1);
  });

  it('creates an input request the same way', async () => {
    const { ingest, inboxRepo } = setup();
    const result = await ingest.createInputRequest(inputBody, 'req-12345678');
    expect(result.created).toBe(true);
    expect([...inboxRepo.inputs.values()][0]).toMatchObject({ upstream_request_id: inputBody.input_request_id });
  });

  it('answers 404 for a run of another workspace or one that does not exist', async () => {
    const { ingest } = setup();
    await expect(ingest.createApproval({ ...approvalBody, workspace_id: OTHER_WS }, 'req-12345678')).rejects.toMatchObject({ status: 404 });
    await expect(
      ingest.createApproval({ ...approvalBody, run_id: 'run_ffffffff-0000-4000-8000-000000000009' }, 'req-12345678'),
    ).rejects.toMatchObject({ status: 404 });
  });
});
