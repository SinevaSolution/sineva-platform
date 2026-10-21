import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getOpenApi } from '@/app/api/openapi.json/route';
import { POST as postAgentChat } from '@/app/api/v1/agents/[agent_slug]/chat/route';
import { GET as getAgents, POST as postAgent } from '@/app/api/v1/agents/route';
import { GET as getHealth } from '@/app/api/v1/health/route';
import { POST as postPresign } from '@/app/api/v1/storage/presign/route';
import {
  UpstreamServiceError,
  UpstreamUnavailableError,
} from '@/server/domain/errors/domain_error';
import { GetAgentsUseCase } from '@/server/application/use-cases/get_agents_use_case';
import { GetSystemHealthUseCase } from '@/server/application/use-cases/get_system_health_use_case';
import { PresignStorageUploadUseCase } from '@/server/application/use-cases/presign_storage_upload_use_case';
import { SendAgentMessageUseCase } from '@/server/application/use-cases/send_agent_message_use_case';
import { FakeAgentRepository } from './fakes/fake_agent_repository';
import { FakeAiEngineGateway } from './fakes/fake_ai_engine_gateway';
import { FakeCache } from './fakes/fake_cache';
import { FakeDatabaseHealthProbe } from './fakes/fake_database_health_probe';
import { FakeStorage } from './fakes/fake_storage';

// The real container wires Postgres, Redis and S3 adapters, and unit tests
// must run without any of them. Routes are exercised against the real use
// cases backed by the in-memory fakes instead. `vi.mock` is hoisted above the
// imports, so the factory can only reach the holder created with `vi.hoisted`;
// `beforeEach` fills it with fresh fakes so tests cannot see each other's writes.
const container = vi.hoisted(() => ({
  current: null as unknown as {
    getAgents: unknown;
    sendAgentMessage: unknown;
    presignStorageUpload: unknown;
    systemHealth: unknown;
    aiEngine: FakeAiEngineGateway;
  },
}));

vi.mock('@/server/container', () => ({
  getGetAgentsUseCase: () => container.current.getAgents,
  getSendAgentMessageUseCase: () => container.current.sendAgentMessage,
  getPresignStorageUploadUseCase: () => container.current.presignStorageUpload,
  getSystemHealthUseCase: () => container.current.systemHealth,
}));

describe('Next.js App Router API v1 Route Handlers', () => {
  beforeEach(() => {
    const agents = new FakeAgentRepository();
    const cache = new FakeCache();
    const storage = new FakeStorage();
    const aiEngine = new FakeAiEngineGateway();
    const dbProbe = new FakeDatabaseHealthProbe();
    container.current = {
      getAgents: new GetAgentsUseCase(agents, cache),
      sendAgentMessage: new SendAgentMessageUseCase(agents, aiEngine),
      presignStorageUpload: new PresignStorageUploadUseCase(storage),
      systemHealth: new GetSystemHealthUseCase(
        dbProbe,
        cache,
        storage,
        aiEngine,
        'sineva-assets',
      ),
      aiEngine,
    };
  });

  it('GET /api/v1/health returns a valid 200 snake_case envelope', async () => {
    const res = await getHealth();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ status: 'healthy' });
    expect(body.meta.request_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^req_/i,
    );
    expect(body.errors).toBeNull();
  });

  it('GET /api/v1/agents returns paginated specialized companions', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/agents?page=1&per_page=4',
    );
    const res = await getAgents(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(4);
    expect(body.meta.total_items).toBeGreaterThanOrEqual(6);
    expect(body.meta.has_next).toBe(true);
  });

  it('POST /api/v1/agents registers a new companion and validates payload', async () => {
    const validReq = new NextRequest('http://localhost:3000/api/v1/agents', {
      method: 'POST',
      body: JSON.stringify({
        agent_slug: 'sinocompliance',
        display_name: 'SinoCompliance',
        role_title: 'SOC2 & ISO27001 Auditor',
        category: 'finance_ops',
        short_description:
          'Continuously monitors cloud controls and audit evidence.',
        capabilities: ['soc2_evidence_collection', 'vendor_risk_matrix'],
      }),
    });

    const res = await postAgent(validReq);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.agent_slug).toBe('sinocompliance');
  });

  it('POST /api/v1/agents responds 409 when the slug is already registered', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/agents', {
      method: 'POST',
      body: JSON.stringify({
        agent_slug: 'sinofinance',
        display_name: 'Impostor',
        role_title: 'Duplicate slug',
        category: 'finance_ops',
        short_description: 'Reuses a slug that already exists.',
        capabilities: ['anything'],
      }),
    });

    const res = await postAgent(req);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.errors[0].code).toBe('RESOURCE_CONFLICT');
  });

  const CHAT_SESSION_ID = '8f3a1c2d-6b4e-4d7a-9c15-2e0b7a41f9d3';

  function chatRequest(body: unknown) {
    return new NextRequest(
      'http://localhost:3000/api/v1/agents/sinosales/chat',
      { method: 'POST', body: JSON.stringify(body) },
    );
  }

  const chatContext = {
    params: Promise.resolve({ agent_slug: 'sinosales' }),
  };

  it('POST /api/v1/agents/[agent_slug]/chat returns the sineva-ai reply fields plus latency_ms', async () => {
    const res = await postAgentChat(
      chatRequest({
        session_id: CHAT_SESSION_ID,
        user_id: 'usr_ae_01',
        message_text: 'Draft outbound sequence for fintech CFOs',
      }),
      chatContext,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.agent_slug).toBe('sinosales');
    expect(body.data.session_id).toBe(CHAT_SESSION_ID);
    expect(body.data.reply_content).toContain(
      'Draft outbound sequence for fintech CFOs',
    );
    expect(Object.keys(body.data).sort()).toEqual(
      [
        'agent_slug',
        'citations',
        'created_at',
        'display_name',
        'execution_mode',
        'handle',
        'latency_ms',
        'message_id',
        'model_id',
        'reply_content',
        'routed_agent_slug',
        'session_id',
        'token_usage',
        'tool_calls',
      ].sort(),
    );
  });

  it('POST /api/v1/agents/[agent_slug]/chat accepts a request without session_id', async () => {
    const res = await postAgentChat(
      chatRequest({ user_id: 'usr_ae_01', message_text: 'Hello' }),
      chatContext,
    );

    expect(res.status).toBe(200);
    expect(container.current.aiEngine.requests[0]?.session_id).toBeUndefined();
  });

  it('POST /api/v1/agents/[agent_slug]/chat responds 422 on an invalid body', async () => {
    const res = await postAgentChat(
      chatRequest({ session_id: 's', user_id: '', message_text: '' }),
      chatContext,
    );
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.success).toBe(false);
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it('POST /api/v1/agents/[agent_slug]/chat responds 422 when session_id is not a UUID', async () => {
    const res = await postAgentChat(
      chatRequest({
        session_id: 'ses_sales_001',
        user_id: 'usr_ae_01',
        message_text: 'Hello',
      }),
      chatContext,
    );
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.errors[0].field).toBe('session_id');
    expect(container.current.aiEngine.requests).toHaveLength(0);
  });

  it('POST /api/v1/agents/[agent_slug]/chat responds 404 for an unknown companion', async () => {
    const res = await postAgentChat(
      chatRequest({ user_id: 'usr_ae_01', message_text: 'Hello' }),
      { params: Promise.resolve({ agent_slug: 'unknown-companion' }) },
    );

    expect(res.status).toBe(404);
  });

  it('POST /api/v1/agents/[agent_slug]/chat responds 502 when sineva-ai fails', async () => {
    container.current.aiEngine.failure = new UpstreamServiceError();

    const res = await postAgentChat(
      chatRequest({ user_id: 'usr_ae_01', message_text: 'Hello' }),
      chatContext,
    );
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.success).toBe(false);
    expect(body.data).toBeNull();
    expect(body.errors[0].code).toBe('UPSTREAM_ERROR');
  });

  it('POST /api/v1/agents/[agent_slug]/chat responds 503 when sineva-ai is unreachable', async () => {
    container.current.aiEngine.failure = new UpstreamUnavailableError();

    const res = await postAgentChat(
      chatRequest({ user_id: 'usr_ae_01', message_text: 'Hello' }),
      chatContext,
    );
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.success).toBe(false);
    expect(body.errors[0].code).toBe('UPSTREAM_UNAVAILABLE');
  });

  it('POST /api/v1/storage/presign returns 201 presigned SeaweedFS S3 metadata', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/storage/presign',
      {
        method: 'POST',
        body: JSON.stringify({
          workspace_id: 'wks_sineva_01',
          file_name: 'annual_report.pdf',
          content_type: 'application/pdf',
          file_size_bytes: 102400,
        }),
      },
    );

    const res = await postPresign(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.storage_provider).toBe('seaweedfs_s3');
  });

  it('GET /api/openapi.json returns OpenAPI 3.1.0 specification', async () => {
    const res = await getOpenApi();
    const spec = await res.json();

    expect(res.status).toBe(200);
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.paths['/api/v1/health']).toBeDefined();
  });

  it('GET /api/openapi.json documents the chat contract, including upstream failures', async () => {
    const res = await getOpenApi();
    const spec = await res.json();

    const chat = spec.paths['/api/v1/agents/{agent_slug}/chat'].post;
    expect(Object.keys(chat.responses)).toEqual(
      expect.arrayContaining(['200', '404', '422', '502', '503']),
    );
    expect(chat.parameters[0].schema.example).toBe('sinofinance');

    const request = spec.components.schemas.SendAgentChatRequest;
    expect(request.required).not.toContain('session_id');
    expect(request.properties.session_id.format).toBe('uuid');

    const reply = spec.components.schemas.AgentChatReply;
    expect(Object.keys(reply.properties)).toEqual([
      'message_id',
      'session_id',
      'agent_slug',
      'display_name',
      'handle',
      'routed_agent_slug',
      'reply_content',
      'model_id',
      'execution_mode',
      'token_usage',
      'tool_calls',
      'citations',
      'created_at',
      'latency_ms',
    ]);

    expect(spec.paths['/api/v1/agents'].post.responses['409']).toBeDefined();
    expect(JSON.stringify(spec)).not.toMatch(/sino[-_]/);
  });
});
