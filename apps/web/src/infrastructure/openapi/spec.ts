export function getOpenApiSpec(): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Sineva Platform Unified REST & BFF API',
      version: '1.0.0',
      description:
        'Standardized snake_case REST API for the Sineva AI Companion Platform. Bridges client workspaces to PostgreSQL (Drizzle), Redis, SeaweedFS S3, and the internal sineva-ai FastAPI engine.',
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
                example: 'sino-finance',
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
              description: 'Companion response and suggested actions',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/StandardEnvelope',
                  },
                },
              },
            },
            '404': {
              description: 'Agent not found',
            },
            '422': {
              description: 'Validation error',
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
            agent_slug: { type: 'string', example: 'sino-legal' },
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
          required: ['session_id', 'user_id', 'message_text'],
          properties: {
            session_id: { type: 'string', example: 'ses_workspace_alpha_01' },
            user_id: { type: 'string', example: 'usr_founder_01' },
            message_text: {
              type: 'string',
              example: 'Summarize our Q3 burn multiple and flag top 3 vendor increases.',
            },
            context_metadata: {
              type: 'object',
              additionalProperties: true,
            },
          },
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
