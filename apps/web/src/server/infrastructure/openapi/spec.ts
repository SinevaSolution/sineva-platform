import 'server-only';

const CHAT_REPLY_EXAMPLE = {
  message_id: 'c2e8f1a4-0d93-4b6e-a7c5-5f1d3e9b8a60',
  session_id: '8f3a1c2d-6b4e-4d7a-9c15-2e0b7a41f9d3',
  agent_slug: 'sinofinance',
  display_name: 'Sino Finance',
  handle: '@SinoFinance',
  routed_agent_slug: 'sinofinance',
  reply_content:
    'Net burn is $0 this month with an estimated runway above 24 months.',
  model_id: 'openai:gpt-4o-mini',
  execution_mode: 'agno_deterministic_runtime',
  token_usage: { prompt_tokens: 18, completion_tokens: 122, total_tokens: 140 },
  tool_calls: [
    {
      tool_name: 'calculate_saas_burn_metrics',
      arguments: {},
      result_summary: 'net_burn_usd: 0.0, estimated_runway_months: 999.0',
    },
  ],
  citations: [
    {
      document_id: '89e98e76-fd4a-52fe-bcb2-c7c8e220eb25',
      title: 'Corporate Expense & Procurement Controls',
      similarity_score: 0.9002,
      source_uri: 's3://sineva-artifacts/finance/expense_controls.pdf',
    },
  ],
  created_at: '2026-10-21T01:44:34.656409Z',
  latency_ms: 842,
};

function errorExample(
  status: number,
  message: string,
  code: string,
  field: string | null = null,
  detail: string = message,
) {
  return {
    success: false,
    status,
    message,
    data: null,
    meta: {
      request_id: 'req_1760980000_ab12cd',
      timestamp: '2026-10-21T01:44:35.000Z',
    },
    errors: [{ code, field, detail }],
  };
}

export function getOpenApiSpec(): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Sineva Platform Unified REST & BFF API',
      version: '1.0.0',
      description:
        'Standardized snake_case REST API for the Sineva AI Companion Platform. Bridges client workspaces to PostgreSQL (Prisma), Redis, SeaweedFS S3, and the internal sineva-ai FastAPI engine.',
      contact: {
        name: 'Sineva Platform Architecture Team',
        url: 'https://sineva.ai',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Local Development & Docker Compose Gateway',
      },
    ],
    tags: [
      {
        name: 'Health',
        description: 'Shared infrastructure & internal AI gateway readiness',
      },
      {
        name: 'Agents',
        description: 'Specialized AI companion registry & multi-agent chat',
      },
      {
        name: 'Storage',
        description: 'SeaweedFS S3 presigned upload workflows',
      },
    ],
    paths: {
      '/api/v1/health': {
        get: {
          tags: ['Health'],
          summary: 'Inspect system & shared infrastructure health',
          operationId: 'get_system_health',
          responses: {
            '200': {
              description: 'Standard snake_case health envelope',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/StandardEnvelope',
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/agents': {
        get: {
          tags: ['Agents'],
          summary: 'List specialized Sineva AI companions with pagination',
          operationId: 'list_agents',
          parameters: [
            {
              name: 'page',
              in: 'query',
              required: false,
              schema: { type: 'integer', default: 1 },
            },
            {
              name: 'per_page',
              in: 'query',
              required: false,
              schema: { type: 'integer', default: 10 },
            },
            {
              name: 'category_filter',
              in: 'query',
              required: false,
              schema: {
                type: 'string',
                enum: [
                  'people_hr',
                  'finance_ops',
                  'sales_growth',
                  'social_marketing',
                  'customer_support',
                  'data_insights',
                ],
              },
            },
          ],
          responses: {
            '200': {
              description: 'Paginated list of specialized AI companions',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/StandardEnvelope',
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ['Agents'],
          summary: 'Register a custom workspace AI companion configuration',
          operationId: 'create_agent',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/CreateAgentRequest',
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Created agent companion configuration',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/StandardEnvelope',
                  },
                },
              },
            },
            '409': {
              description: 'An agent with this agent_slug already exists',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                  example: errorExample(
                    409,
                    "Agent 'sinofinance' already exists",
                    'RESOURCE_CONFLICT',
                  ),
                },
              },
            },
            '422': {
              description: 'Validation error',
            },
          },
        },
      },
      '/api/v1/agents/{agent_slug}/chat': {
        post: {
          tags: ['Agents'],
          summary:
            'Dispatch a chat message to a specialized AI companion via the internal sineva-ai gateway',
          operationId: 'send_agent_chat_message',
          parameters: [
            {
              name: 'agent_slug',
              in: 'path',
              required: true,
              schema: {
                type: 'string',
                example: 'sinofinance',
              },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/SendAgentChatRequest',
                },
              },
            },
          },
          responses: {
            '200': {
              description:
                'Companion reply. Fields mirror the sineva-ai chat response; latency_ms is measured by the platform.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/AgentChatResponseEnvelope',
                  },
                  example: {
                    success: true,
                    status: 200,
                    message: 'Agent companion message processed successfully',
                    data: CHAT_REPLY_EXAMPLE,
                    meta: {
                      request_id: 'req_1760980000_ab12cd',
                      timestamp: '2026-10-21T01:44:35.000Z',
                    },
                    errors: null,
                  },
                },
              },
            },
            '404': {
              description: 'Agent not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                  example: errorExample(
                    404,
                    "Agent 'unknown-companion' was not found",
                    'RESOURCE_NOT_FOUND',
                  ),
                },
              },
            },
            '422': {
              description:
                'Validation error, e.g. session_id is not a UUID or message_text is empty',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                  example: errorExample(
                    422,
                    'Request payload validation failed',
                    'VALIDATION_ERROR',
                    'session_id',
                    'Invalid uuid',
                  ),
                },
              },
            },
            '502': {
              description:
                'sineva-ai answered with a non-2xx status or a body that failed contract validation. No reply text is fabricated.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                  example: errorExample(
                    502,
                    'The AI engine returned an unexpected response',
                    'UPSTREAM_ERROR',
                  ),
                },
              },
            },
            '503': {
              description:
                'sineva-ai could not be reached (network error, timeout or abort). The turn may still have completed upstream and there is no idempotency key, so a retry can run it twice.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/StandardEnvelope' },
                  example: errorExample(
                    503,
                    'The AI engine is unavailable',
                    'UPSTREAM_UNAVAILABLE',
                  ),
                },
              },
            },
          },
        },
      },
      '/api/v1/storage/presign': {
        post: {
          tags: ['Storage'],
          summary: 'Generate a SeaweedFS S3 presigned upload URL',
          operationId: 'presign_storage_upload',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/PresignUploadRequest',
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Presigned S3 upload URL metadata',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/StandardEnvelope',
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        StandardEnvelope: {
          type: 'object',
          required: ['success', 'status', 'message', 'data', 'meta', 'errors'],
          properties: {
            success: { type: 'boolean', example: true },
            status: { type: 'integer', example: 200 },
            message: {
              type: 'string',
              example: 'Operation completed successfully',
            },
            code: {
              type: 'string',
              enum: [
                'validation_failed',
                'unauthenticated',
                'forbidden',
                'not_found',
                'conflict',
                'model_unavailable',
                'dependency_unavailable',
                'internal_error',
              ],
              example: 'validation_failed',
              description: 'Stable machine code mapped to client message keys (FR-UX-31)',
            },
            data: { type: ['object', 'array', 'null'] },
            meta: {
              type: ['object', 'null'],
              properties: {
                page: { type: 'integer', example: 1 },
                per_page: { type: 'integer', example: 10 },
                total_items: { type: 'integer', example: 6 },
                total_pages: { type: 'integer', example: 1 },
                has_next: { type: 'boolean', example: false },
                has_prev: { type: 'boolean', example: false },
                request_id: { type: 'string', example: 'req_1760980000_ab12cd' },
                timestamp: {
                  type: 'string',
                  format: 'date-time',
                },
              },
            },
            errors: {
              type: ['array', 'null'],
              items: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  field: { type: ['string', 'null'] },
                  detail: { type: 'string' },
                },
              },
            },
          },
        },
        CreateAgentRequest: {
          type: 'object',
          required: [
            'agent_slug',
            'display_name',
            'role_title',
            'category',
            'short_description',
            'capabilities',
          ],
          properties: {
            agent_slug: { type: 'string', example: 'sinolegal' },
            display_name: { type: 'string', example: 'SinoLegal' },
            role_title: {
              type: 'string',
              example: 'Contract & Compliance Counsel',
            },
            category: { type: 'string', example: 'finance_ops' },
            short_description: {
              type: 'string',
              example: 'Reviews MSA clauses and DPA schedules.',
            },
            capabilities: {
              type: 'array',
              items: { type: 'string' },
              example: ['msa_redlining', 'gdpr_dpa_audit'],
            },
            model_name: { type: 'string', example: 'sineva-core-v2' },
          },
        },
        SendAgentChatRequest: {
          type: 'object',
          required: ['user_id', 'message_text'],
          properties: {
            session_id: {
              type: 'string',
              format: 'uuid',
              description:
                'Conversation session. Omit on the first turn: sineva-ai creates one and returns it as data.session_id.',
              example: '8f3a1c2d-6b4e-4d7a-9c15-2e0b7a41f9d3',
            },
            user_id: { type: 'string', example: 'usr_01J9ZQ4K7M' },
            message_text: {
              type: 'string',
              example: 'What is our current monthly burn rate and runway?',
            },
            context_metadata: {
              type: 'object',
              additionalProperties: true,
              example: { locale: 'id-ID', channel: 'web_chat' },
            },
          },
        },
        AgentChatReply: {
          type: 'object',
          description:
            'Mirrors the sineva-ai chat response, plus latency_ms measured by the platform.',
          required: [
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
          ],
          properties: {
            message_id: { type: 'string', format: 'uuid' },
            session_id: { type: 'string', format: 'uuid' },
            agent_slug: { type: 'string', example: 'sinofinance' },
            display_name: { type: 'string', example: 'Sino Finance' },
            handle: { type: 'string', example: '@SinoFinance' },
            routed_agent_slug: {
              type: 'string',
              description: 'Companion that actually answered.',
              example: 'sinofinance',
            },
            reply_content: { type: 'string' },
            model_id: { type: 'string', example: 'openai:gpt-4o-mini' },
            execution_mode: {
              type: 'string',
              example: 'agno_deterministic_runtime',
            },
            token_usage: {
              type: 'object',
              additionalProperties: { type: 'integer' },
              example: {
                prompt_tokens: 18,
                completion_tokens: 122,
                total_tokens: 140,
              },
            },
            tool_calls: {
              type: 'array',
              items: {
                type: 'object',
                required: ['tool_name', 'arguments', 'result_summary'],
                properties: {
                  tool_name: { type: 'string' },
                  arguments: { type: 'object', additionalProperties: true },
                  result_summary: { type: ['string', 'null'] },
                },
              },
            },
            citations: {
              type: 'array',
              items: {
                type: 'object',
                required: [
                  'document_id',
                  'title',
                  'similarity_score',
                  'source_uri',
                ],
                properties: {
                  document_id: { type: 'string', format: 'uuid' },
                  title: { type: 'string' },
                  similarity_score: { type: 'number' },
                  source_uri: { type: ['string', 'null'] },
                },
              },
            },
            created_at: { type: 'string', format: 'date-time' },
            latency_ms: {
              type: 'integer',
              description: 'Platform-measured round trip to sineva-ai.',
              example: 842,
            },
          },
        },
        AgentChatResponseEnvelope: {
          allOf: [
            { $ref: '#/components/schemas/StandardEnvelope' },
            {
              type: 'object',
              properties: {
                data: { $ref: '#/components/schemas/AgentChatReply' },
              },
            },
          ],
        },
        PresignUploadRequest: {
          type: 'object',
          required: [
            'workspace_id',
            'file_name',
            'content_type',
            'file_size_bytes',
          ],
          properties: {
            workspace_id: { type: 'string', example: 'wks_sineva_hq' },
            file_name: { type: 'string', example: 'q3_board_deck.pdf' },
            content_type: { type: 'string', example: 'application/pdf' },
            file_size_bytes: { type: 'integer', example: 2048576 },
          },
        },
      },
    },
  };
}
