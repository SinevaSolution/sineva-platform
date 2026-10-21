import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/server/infrastructure/database/generated/client';

// Standalone script: it deliberately does not import `prisma_client.ts`, which
// carries `import 'server-only'` and would throw when run outside a Next build.

interface SeedAgent {
  agent_slug: string;
  display_name: string;
  role_title: string;
  category: string;
  status: string;
  short_description: string;
  capabilities: string[];
  model_name: string;
  avg_latency_ms: number;
  active_sessions_count: number;
  daily_tokens_used: number;
  accent_token: string;
  created_at: string;
  updated_at: string;
}

const DEFAULT_SPECIALIZED_AGENTS: SeedAgent[] = [
  {
    agent_slug: 'sinopeople',
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
    agent_slug: 'sinofinance',
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
    agent_slug: 'sinosales',
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
    agent_slug: 'sinosocial',
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
    agent_slug: 'sinohelp',
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
    agent_slug: 'sinoinsights',
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

async function seedTenants(prisma: PrismaClient): Promise<void> {
  // Tenant 1: Sineva HQ
  const user1 = await prisma.user.upsert({
    where: { email: 'admin@sineva.ai' },
    create: {
      email: 'admin@sineva.ai',
      full_name: 'Alice Pratama',
      preferred_name: 'Alice',
      locale: 'id',
      timezone: 'Asia/Jakarta',
      status: 'active',
      email_verified: true,
      email_verified_at: new Date('2026-10-01T08:00:00.000Z'),
    },
    update: {
      full_name: 'Alice Pratama',
      status: 'active',
    },
  });

  const ws1 = await prisma.workspace.upsert({
    where: { workspace_slug: 'sineva-hq' },
    create: {
      workspace_slug: 'sineva-hq',
      workspace_name: 'Sineva HQ',
      owner_user_id: user1.id,
      status: 'active',
      default_locale: 'id',
      timezone: 'Asia/Jakarta',
    },
    update: {
      workspace_name: 'Sineva HQ',
      owner_user_id: user1.id,
      status: 'active',
    },
  });

  await prisma.workspaceMember.upsert({
    where: {
      workspace_id_user_id: {
        workspace_id: ws1.id,
        user_id: user1.id,
      },
    },
    create: {
      workspace_id: ws1.id,
      user_id: user1.id,
      role: 'owner',
      specialist_scope: 'all',
      job_title: 'Founding Engineer',
      department: 'Engineering',
    },
    update: {
      role: 'owner',
      specialist_scope: 'all',
    },
  });

  // Tenant 2: Acme Corp
  const user2 = await prisma.user.upsert({
    where: { email: 'owner@acme.com' },
    create: {
      email: 'owner@acme.com',
      full_name: 'Budi Santoso',
      preferred_name: 'Budi',
      locale: 'id',
      timezone: 'Asia/Jakarta',
      status: 'active',
      email_verified: true,
      email_verified_at: new Date('2026-10-01T08:00:00.000Z'),
    },
    update: {
      full_name: 'Budi Santoso',
      status: 'active',
    },
  });

  const ws2 = await prisma.workspace.upsert({
    where: { workspace_slug: 'acme-corp' },
    create: {
      workspace_slug: 'acme-corp',
      workspace_name: 'Acme Corporation',
      owner_user_id: user2.id,
      status: 'active',
      default_locale: 'id',
      timezone: 'Asia/Jakarta',
    },
    update: {
      workspace_name: 'Acme Corporation',
      owner_user_id: user2.id,
      status: 'active',
    },
  });

  await prisma.workspaceMember.upsert({
    where: {
      workspace_id_user_id: {
        workspace_id: ws2.id,
        user_id: user2.id,
      },
    },
    create: {
      workspace_id: ws2.id,
      user_id: user2.id,
      role: 'owner',
      specialist_scope: 'all',
      job_title: 'Managing Director',
      department: 'Operations',
    },
    update: {
      role: 'owner',
      specialist_scope: 'all',
    },
  });

  console.log('Seeded 2 test tenants (sineva-hq, acme-corp) with owners');
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to seed the database');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    await seedTenants(prisma);

    for (const agent of DEFAULT_SPECIALIZED_AGENTS) {
      // Ids are left to the database default (uuid); the slug is the natural key.
      const { agent_slug, created_at, updated_at, ...rest } = agent;
      const timestamps = {
        created_at: new Date(created_at),
        updated_at: new Date(updated_at),
      };

      await prisma.agentConfig.upsert({
        where: { agent_slug },
        create: { agent_slug, ...rest, ...timestamps },
        // Re-seeding refreshes the catalogue copy only. status, latency,
        // sessions and token counters are live runtime metrics: overwriting
        // them with the seed's snapshot would corrupt a running system.
        update: {
          display_name: rest.display_name,
          role_title: rest.role_title,
          category: rest.category,
          short_description: rest.short_description,
          capabilities: rest.capabilities,
          model_name: rest.model_name,
          accent_token: rest.accent_token,
        },
      });
    }
    console.log(`Seeded ${DEFAULT_SPECIALIZED_AGENTS.length} agents`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
