import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chatTurnRequestV2Schema, sseDoneEventSchema, sseTokenEventSchema } from '@/server/application/dtos/chat_v2_dto';
import {
  squadDoneExtrasSchema,
  squadHandoffEventSchema,
  squadHandoffResultEventSchema,
  squadTurnLimitEventSchema,
} from '@/server/application/dtos/squad_dto';
import { UpstreamUnavailableError } from '@/server/domain/errors/domain_error';
import { SQUAD_STARTER_BOUNDS, buildSquadClaim, type SquadEntity } from '@/server/domain/squads/squad';
import { InternalAiEngineGateway } from '@/server/infrastructure/gateways/internal_ai_engine_gateway';
import { MAX_CONTEXT_HEADER_BYTES, createDefaultContextSigner } from '@/server/infrastructure/security/context_signer';
import { SseParser } from '@/shared/sse';
import claimsFixture from './fixtures/squad_signed_context_claims.json';
import directRequest from './fixtures/squad_chat_request_direct.json';
import leadRequest from './fixtures/squad_chat_request.json';

// The squad_* fixtures are proposed by the platform and pending sineva-ai
// (fixtures/README.md, ADR-0044). These tests pin the platform side.

const AI_URL = 'http://sineva-ai.test:8000';
const AI_KEY = 'test_internal_key';
const SQUAD_ID = '4d1c6f0e-2b7a-4c53-9e18-0a5d3f7b9c21';
const text = (name: string) => readFileSync(resolve(import.meta.dirname, 'fixtures', name), 'utf8');

function frames(name: string) {
  const parser = new SseParser();
  return [...parser.push(text(name)), ...parser.flush()].flatMap((item) => (item.kind === 'frame' ? [item.frame] : []));
}

const squad = (over: Partial<SquadEntity> = {}): SquadEntity => ({
  id: SQUAD_ID,
  workspace_id: claimsFixture.tenant_id,
  name: 'Back-office',
  goal: 'Close the month',
  lead_type: 'sino',
  lead_agent_slug: null,
  template_slug: null,
  status: 'active',
  limits: null,
  created_by: claimsFixture.user_id,
  archived_at: null,
  created_at: '2026-10-23T00:00:00.000Z',
  updated_at: '2026-10-23T00:00:00.000Z',
  members: ['sinofinance', 'sinopeople'].map((agent_slug, position) => ({
    agent_slug,
    position,
    added_by: null,
    added_at: '2026-10-23T00:00:00.000Z',
  })),
  ...over,
});

describe('squad request fixtures', () => {
  it('are valid chat turn requests of contract v2 (the squad travels in the context, not the body)', () => {
    expect(chatTurnRequestV2Schema.safeParse(leadRequest).success).toBe(true);
    expect(chatTurnRequestV2Schema.safeParse(directRequest).success).toBe(true);
    expect(JSON.stringify(leadRequest)).not.toContain(SQUAD_ID);
    expect(directRequest.mentions[0]).toMatchObject({ agent_slug: 'sinofinance', start: 0 });
  });
});

describe('squad signed context claims fixture', () => {
  it('matches what the platform builds from a stored squad', () => {
    const claim = buildSquadClaim(squad(), {});
    expect(claimsFixture.squad).toEqual(claim);
    expect(claimsFixture.budget).toEqual({
      max_credits: SQUAD_STARTER_BOUNDS.max_credits,
      max_tokens: SQUAD_STARTER_BOUNDS.max_tokens,
    });
  });

  it('never carries the goal text, tenant data from the model, or a tool nobody granted', () => {
    expect(JSON.stringify(claimsFixture)).not.toContain('Close the month');
    expect(claimsFixture.squad.members.every((m) => Array.isArray(m.allowed_tools))).toBe(true);
  });

  it('survives signing with five members inside the header budget', async () => {
    const five = squad({
      members: ['sinopeople', 'sinofinance', 'sinosales', 'sinosocial', 'sinohelp'].map((agent_slug, position) => ({
        agent_slug,
        position,
        added_by: null,
        added_at: '2026-10-23T00:00:00.000Z',
      })),
    });
    const tools = { sinofinance: Array.from({ length: 12 }, (_, i) => `read_tool_number_${i}`) };
    const signer = createDefaultContextSigner();
    const { token, claims } = await signer.mint(
      { user_id: 'u', workspace_id: claimsFixture.tenant_id, session_id: 's', request_id: 'r', role: 'member' },
      { squad: buildSquadClaim(five, tools), budget: claimsFixture.budget },
    );
    expect(Buffer.byteLength(token)).toBeLessThan(MAX_CONTEXT_HEADER_BYTES);
    expect(claims.squad?.members).toHaveLength(5);
    expect(claims.budget).toEqual(claimsFixture.budget);
  });
});

describe('squad SSE transcripts', () => {
  const names = [
    'squad_sse_transcript_success.txt',
    'squad_sse_transcript_turn_limit.txt',
    'squad_sse_transcript_member_failure.txt',
    'squad_sse_transcript_direct_member.txt',
  ];

  it('use only events the platform understands, with payloads that validate', () => {
    for (const name of names) {
      const list = frames(name);
      expect(list[0]?.event, name).toBe('run_started');
      expect(list.at(-1)?.event, name).toBe('done');
      for (const frame of list) {
        const data = JSON.parse(frame.data);
        if (frame.event === 'handoff') expect(squadHandoffEventSchema.safeParse(data).success, name).toBe(true);
        if (frame.event === 'handoff_result') expect(squadHandoffResultEventSchema.safeParse(data).success, name).toBe(true);
        if (frame.event === 'turn_limit') expect(squadTurnLimitEventSchema.safeParse(data).success, name).toBe(true);
        if (frame.event === 'token') expect(sseTokenEventSchema.safeParse(data).success, name).toBe(true);
        if (frame.event === 'done') {
          expect(sseDoneEventSchema.safeParse(data).success, name).toBe(true);
          expect(squadDoneExtrasSchema.safeParse(data.squad).success, name).toBe(true);
        }
      }
    }
  });

  it('shows the three outcomes the screen has to draw: success, a cap, a failed member', () => {
    expect(frames(names[0]!).filter((f) => f.event === 'handoff')).toHaveLength(2);
    const limit = frames(names[1]!).find((f) => f.event === 'turn_limit');
    expect(JSON.parse(limit!.data)).toMatchObject({ cap: 'cap_credits' });
    const failed = frames(names[2]!).filter((f) => f.event === 'handoff_result').map((f) => JSON.parse(f.data).status);
    expect(failed).toContain('failed');
  });

  it('keeps the speaker on the lead, or on the member in a direct address', () => {
    const speakers = (name: string) => frames(name).filter((f) => f.event === 'token').map((f) => JSON.parse(f.data).speaker);
    expect(new Set(speakers(names[0]!))).toEqual(new Set(['sino']));
    expect(new Set(speakers(names[3]!))).toEqual(new Set(['sinofinance']));
  });
});

describe('InternalAiEngineGateway.squadChatStream against the proposed endpoint', () => {
  beforeEach(() => {
    vi.stubEnv('AI_ENGINE_INTERNAL_URL', AI_URL);
    vi.stubEnv('AI_ENGINE_INTERNAL_API_KEY', AI_KEY);
    vi.stubEnv('AI_ENGINE_TIMEOUT_MS', '15000');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('POSTs the request to /api/v2/squads/{squad_id}/chat with the internal key and the signed context', async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response('id: 1\n\n', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const request = chatTurnRequestV2Schema.parse(leadRequest);
    await new InternalAiEngineGateway().squadChatStream({ squadId: SQUAD_ID, request, contextToken: 'ctx.token', requestId: 'req-12345678' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${AI_URL}/api/v2/squads/${SQUAD_ID}/chat`);
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['X-Internal-Api-Key']).toBe(AI_KEY);
    expect(headers['X-Sineva-Context']).toBe('ctx.token');
    expect(headers.Accept).toBe('text/event-stream');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual(request);
  });

  it('is a typed 503 when sineva-ai cannot be reached (no replacement text)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    await expect(
      new InternalAiEngineGateway().squadChatStream({ squadId: SQUAD_ID, request: chatTurnRequestV2Schema.parse(leadRequest), contextToken: 'c' }),
    ).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });
});
