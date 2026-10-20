import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { AgentEntity } from '@/domain/entities/agent';
import type {
  AgentRepository,
  CreateAgentInput,
  ListAgentsQuery,
  PaginatedAgentsResult,
} from '@/domain/repositories/agent_repository';
import { getEnvConfig } from '../config/env';
import * as schema from './schema';

let poolInstance: Pool | null = null;

export function getDbPool(): Pool {
  if (!poolInstance) {
    const env = getEnvConfig();
    poolInstance = new Pool({
      connectionString: env.database_url,
      max: 10,
      idleTimeoutMillis: 30000,
    });
  }
  return poolInstance;
}

export function getDbClient() {
  return drizzle(getDbPool(), { schema });
}

const DEFAULT_SPECIALIZED_AGENTS: AgentEntity[] = [
  {
    id: 'agt_01_sinopeople',
    agent_slug: 'sino-people',
    display_name: 'SinoPeople',
    role_title: 'Talent Acquisition & People Operations Specialist',
    category: 'people_hr',
    status: 'online',
    short_description:
      'Automates candidate screening, onboarding workflows, OKR alignment, and employee policy Q&A across global teams.',
    capabilities: [
      'candidate_cv_scoring',
      'onboarding_playbook_synthesis',
      'policy_compliance_qa',
      'pulse_survey_sentiment',
    ],
    model_name: 'sineva-people-pro-v2',
    avg_latency_ms: 340,
    active_sessions_count: 18,
    daily_tokens_used: 142800,
    accent_token: '--teal-500',
    created_at: '2026-10-01T08:00:00.000Z',
    updated_at: '2026-10-20T16:30:00.000Z',
  },
  {
    id: 'agt_02_sinofinance',
    agent_slug: 'sino-finance',
    display_name: 'SinoFinance',
    role_title: 'FP&A, Cashflow & Ledger Reconciliation Architect',
    category: 'finance_ops',
    status: 'online',
    short_description:
      'Monitors real-time runway, reconciles multi-currency invoices, flags anomalous vendor spend, and drafts board-ready variance narratives.',
    capabilities: [
      'multi_currency_reconciliation',
      'burn_rate_forecasting',
      'anomaly_invoice_detection',
      'gaap_ifrs_variance_briefs',
    ],
    model_name: 'sineva-finance-quant-v2',
    avg_latency_ms: 410,
    active_sessions_count: 24,
    daily_tokens_used: 218450,
    accent_token: '--teal-700',
    created_at: '2026-10-01T08:05:00.000Z',
    updated_at: '2026-10-20T16:35:00.000Z',
  },
  {
    id: 'agt_03_sinosales',
    agent_slug: 'sino-sales',
    display_name: 'SinoSales',
    role_title: 'Revenue Intelligence & Outbound Deal Strategist',
    category: 'sales_growth',
    status: 'online',
    short_description:
      'Enriches inbound accounts, drafts hyper-personalized executive sequences, and predicts pipeline conversion probability.',
    capabilities: [
      'account_signal_enrichment',
      'multithread_sequence_drafting',
      'meddic_deal_scoring',
      'objection_battlecards',
    ],
    model_name: 'sineva-revenue-v2',
    avg_latency_ms: 295,
    active_sessions_count: 31,
    daily_tokens_used: 310200,
    accent_token: '--aqua-400',
    created_at: '2026-10-01T08:10:00.000Z',
    updated_at: '2026-10-20T16:40:00.000Z',
  },
  {
    id: 'agt_04_sinosocial',
    agent_slug: 'sino-social',
    display_name: 'SinoSocial',
    role_title: 'Brand Narrative & Omnichannel Campaign Director',
    category: 'social_marketing',
    status: 'online',
    short_description:
      'Orchestrates high-converting editorial calendars, adapts technical launches for LinkedIn/X, and tracks brand share-of-voice.',
    capabilities: [
      'editorial_campaign_matrix',
      'brand_voice_calibration',
      'competitor_ad_benchmarking',
      'engagement_cohort_analysis',
    ],
    model_name: 'sineva-creative-v2',
    avg_latency_ms: 380,
    active_sessions_count: 14,
    daily_tokens_used: 129600,
    accent_token: '--sun-500',
    created_at: '2026-10-01T08:15:00.000Z',
    updated_at: '2026-10-20T16:45:00.000Z',
  },
  {
    id: 'agt_05_sinohelp',
    agent_slug: 'sino-help',
    display_name: 'SinoHelp',
    role_title: 'Tier-2 Technical Support & SLA Resolution Specialist',
    category: 'customer_support',
    status: 'online',
    short_description:
      'Resolves complex technical tickets with RAG-grounded runbooks, auto-triages P1 incidents, and maintains 99.4% SLA adherence.',
    capabilities: [
      'rag_knowledge_retrieval',
      'incident_root_cause_triage',
      'automated_sla_escalation',
      'multilingual_ticket_resolution',
    ],
    model_name: 'sineva-support-fast-v2',
    avg_latency_ms: 220,
    active_sessions_count: 42,
    daily_tokens_used: 405900,
    accent_token: '--teal-500',
    created_at: '2026-10-01T08:20:00.000Z',
    updated_at: '2026-10-20T16:50:00.000Z',
  },
  {
    id: 'agt_06_sinoinsights',
    agent_slug: 'sino-insights',
    display_name: 'SinoInsights',
    role_title: 'Executive BI, Cohort Telemetry & Predictive Analyst',
    category: 'data_insights',
    status: 'standby',
    short_description:
      'Synthesizes cross-departmental warehouse metrics, detects churn precursors, and generates natural-language SQL explorations.',
    capabilities: [
      'nl_to_sql_synthesis',
      'retention_cohort_modeling',
      'executive_kpi_briefings',
      'predictive_churn_alerts',
    ],
    model_name: 'sineva-analytics-pro-v2',
    avg_latency_ms: 490,
    active_sessions_count: 9,
    daily_tokens_used: 184300,
    accent_token: '--teal-700',
    created_at: '2026-10-01T08:25:00.000Z',
    updated_at: '2026-10-20T16:55:00.000Z',
  },
];

export class DrizzleAgentRepository implements AgentRepository {
  private readonly memoryRegistry: Map<string, AgentEntity>;

  constructor() {
    this.memoryRegistry = new Map(
      DEFAULT_SPECIALIZED_AGENTS.map((agent) => [agent.agent_slug, agent]),
    );
  }

  async findAll(query: ListAgentsQuery): Promise<PaginatedAgentsResult> {
    const allAgents = Array.from(this.memoryRegistry.values());
    const filtered = query.category_filter
      ? allAgents.filter((a) => a.category === query.category_filter)
      : allAgents;

    const startIndex = (query.page - 1) * query.per_page;
    const paginatedItems = filtered.slice(
      startIndex,
      startIndex + query.per_page,
    );

    return {
      items: paginatedItems,
      total_items: filtered.length,
    };
  }

  async findBySlug(agent_slug: string): Promise<AgentEntity | null> {
    return this.memoryRegistry.get(agent_slug) ?? null;
  }

  async create(input: CreateAgentInput): Promise<AgentEntity> {
    const now = new Date().toISOString();
    const entity: AgentEntity = {
      id: `agt_${Date.now()}`,
      agent_slug: input.agent_slug,
      display_name: input.display_name,
      role_title: input.role_title,
      category: input.category,
      status: 'online',
      short_description: input.short_description,
      capabilities: input.capabilities,
      model_name: input.model_name,
      avg_latency_ms: 350,
      active_sessions_count: 1,
      daily_tokens_used: 0,
      accent_token: '--teal-500',
      created_at: now,
      updated_at: now,
    };
    this.memoryRegistry.set(entity.agent_slug, entity);
    return entity;
  }
}

export const defaultAgentRepository = new DrizzleAgentRepository();
