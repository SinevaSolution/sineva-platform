import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { GET as getOpenApi } from '@/app/api/openapi.json/route';
import { POST as postAgentChat } from '@/app/api/v1/agents/[agent_slug]/chat/route';
import { GET as getAgents, POST as postAgent } from '@/app/api/v1/agents/route';
import { GET as getHealth } from '@/app/api/v1/health/route';
import { POST as postPresign } from '@/app/api/v1/storage/presign/route';

describe('Next.js App Router API v1 Route Handlers', () => {
  it('GET /api/v1/health returns a valid 200 snake_case envelope', async () => {
    const res = await getHealth();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.service_name).toBe('sineva-platform');
    expect(body.meta.request_id).toMatch(/^req_/);
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
        agent_slug: 'sino-compliance',
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
    expect(body.data.agent_slug).toBe('sino-compliance');
  });

  it('POST /api/v1/agents/[agent_slug]/chat returns 200 for valid companion and 422 on invalid body', async () => {
    const validChatReq = new NextRequest(
      'http://localhost:3000/api/v1/agents/sino-sales/chat',
      {
        method: 'POST',
        body: JSON.stringify({
          session_id: 'ses_sales_001',
          user_id: 'usr_ae_01',
          message_text: 'Draft outbound sequence for fintech CFOs',
        }),
      },
    );

    const res = await postAgentChat(validChatReq, {
      params: Promise.resolve({ agent_slug: 'sino-sales' }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.agent_slug).toBe('sino-sales');

    const invalidChatReq = new NextRequest(
      'http://localhost:3000/api/v1/agents/sino-sales/chat',
      {
        method: 'POST',
        body: JSON.stringify({
          session_id: 's',
          user_id: '',
          message_text: '',
        }),
      },
    );

    const errRes = await postAgentChat(invalidChatReq, {
      params: Promise.resolve({ agent_slug: 'sino-sales' }),
    });
    const errBody = await errRes.json();

    expect(errRes.status).toBe(422);
    expect(errBody.success).toBe(false);
    expect(errBody.errors.length).toBeGreaterThan(0);
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
});
