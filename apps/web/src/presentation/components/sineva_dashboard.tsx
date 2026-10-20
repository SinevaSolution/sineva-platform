'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  CloudUpload,
  Command as CommandIcon,
  Cpu,
  Database,
  FileCode2,
  HardDrive,
  Layers,
  Send,
  ShieldCheck,
  Sparkles,
  Workflow,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, Card, Container, StatusPill } from '@sineva/ui';
import type { AgentCategory, AgentEntity } from '@/domain/entities/agent';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  appendChatTranscript,
  setActiveCategoryFilter,
  setAgentsCatalog,
  setCommandPaletteOpen,
  setDispatchingMessage,
  setSelectedAgentSlug,
} from '../store/slices/agent_slice';
import {
  incrementTokensConsumed,
  setOrchestratorMode,
} from '../store/slices/workspace_slice';
import { CommandPalette } from './command_palette';
import { ThemeToggle } from './theme_toggle';

export interface SinevaDashboardProps {
  initialAgents: AgentEntity[];
}

const CATEGORY_LABELS: Array<{
  key: AgentCategory | 'all';
  label: string;
}> = [
  { key: 'all', label: 'All Companions (6)' },
  { key: 'people_hr', label: 'People & HR' },
  { key: 'finance_ops', label: 'Finance & FP&A' },
  { key: 'sales_growth', label: 'Sales & Revenue' },
  { key: 'social_marketing', label: 'Social & Brand' },
  { key: 'customer_support', label: 'Tier-2 Support' },
  { key: 'data_insights', label: 'BI & Insights' },
];

export function SinevaDashboard({ initialAgents }: SinevaDashboardProps) {
  const dispatch = useAppDispatch();
  const {
    agents_catalog,
    selected_agent_slug,
    active_category_filter,
    is_dispatching_message,
    transcripts_by_slug,
  } = useAppSelector((state) => state.agent_companion);

  const workspace = useAppSelector((state) => state.workspace);

  const [promptInput, setPromptInput] = React.useState('');
  const [lastApiEnvelope, setLastApiEnvelope] = React.useState<string | null>(
    null,
  );
  const [presignPreview, setPresignPreview] = React.useState<string | null>(
    null,
  );

  React.useEffect(() => {
    dispatch(setAgentsCatalog(initialAgents));
  }, [dispatch, initialAgents]);

  const displayedAgents = React.useMemo(() => {
    const source = agents_catalog.length > 0 ? agents_catalog : initialAgents;
    if (active_category_filter === 'all') {
      return source;
    }
    return source.filter((agent) => agent.category === active_category_filter);
  }, [agents_catalog, initialAgents, active_category_filter]);

  const activeAgent = React.useMemo(() => {
    const source = agents_catalog.length > 0 ? agents_catalog : initialAgents;
    return (
      source.find((a) => a.agent_slug === selected_agent_slug) ?? source[0]
    );
  }, [agents_catalog, initialAgents, selected_agent_slug]);

  const activeTranscript = React.useMemo(() => {
    if (!activeAgent) return [];
    return transcripts_by_slug[activeAgent.agent_slug] ?? [];
  }, [activeAgent, transcripts_by_slug]);

  async function handleSendPrompt(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = promptInput.trim();
    if (!trimmed || !activeAgent || is_dispatching_message) {
      return;
    }

    const userMsgId = `msg_usr_${Date.now()}`;
    dispatch(
      appendChatTranscript({
        id: userMsgId,
        agent_slug: activeAgent.agent_slug,
        sender_role: 'user',
        message_text: trimmed,
        created_at: new Date().toISOString(),
      }),
    );
    setPromptInput('');
    dispatch(setDispatchingMessage(true));

    try {
      const response = await fetch(
        `/api/v1/agents/${activeAgent.agent_slug}/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: `ses_${workspace.workspace_id}_${activeAgent.agent_slug}`,
            user_id: 'usr_executive_01',
            message_text: trimmed,
            context_metadata: {
              orchestrator_mode: workspace.orchestrator_mode,
              workspace_slug: workspace.workspace_slug,
            },
          }),
        },
      );

      const envelope = await response.json();
      setLastApiEnvelope(JSON.stringify(envelope, null, 2));

      if (response.ok && envelope.success && envelope.data) {
        const reply = envelope.data;
        dispatch(
          appendChatTranscript({
            id: reply.reply_id,
            agent_slug: activeAgent.agent_slug,
            sender_role: 'agent',
            message_text: reply.reply_text,
            reasoning_summary: reply.reasoning_summary,
            suggested_actions: reply.suggested_actions,
            tokens_used: reply.tokens_used,
            latency_ms: reply.latency_ms,
            created_at: reply.created_at,
          }),
        );
        dispatch(incrementTokensConsumed(reply.tokens_used ?? 120));
        toast.success(`@${activeAgent.display_name} responded`, {
          description: `Processed in ${reply.latency_ms}ms (${reply.engine_source})`,
        });
      } else {
        toast.error(envelope.message ?? 'Failed to dispatch message');
      }
    } catch {
      toast.error('Network error while contacting BFF endpoint');
    } finally {
      dispatch(setDispatchingMessage(false));
    }
  }

  async function handlePresignSampleUpload() {
    try {
      const response = await fetch('/api/v1/storage/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: workspace.workspace_id,
          file_name: 'sineva_q4_board_briefing.pdf',
          content_type: 'application/pdf',
          file_size_bytes: 1_482_900,
        }),
      });
      const envelope = await response.json();
      setPresignPreview(JSON.stringify(envelope, null, 2));
      setLastApiEnvelope(JSON.stringify(envelope, null, 2));
      if (envelope.success) {
        toast.success('SeaweedFS S3 Presigned Upload URL generated', {
          description: `Bucket: ${envelope.data.bucket_name}`,
        });
      }
    } catch {
      toast.error('Could not generate SeaweedFS S3 presigned URL');
    }
  }

  const quotaPercentage = Math.min(
    100,
    Math.round(
      (workspace.monthly_tokens_consumed / workspace.monthly_token_quota) * 100,
    ),
  );

  return (
    <div className="min-h-screen bg-[var(--color-canvas)] text-[var(--color-text)]">
      <CommandPalette />

      {/* Top Sticky Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-canvas)]/85 backdrop-blur-md">
        <Container size="wide" className="flex h-20 items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--color-action-primary)] text-[var(--color-text-inverse)] shadow-xs">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold tracking-tight">
                  Sineva
                </span>
                <Badge tone="teal">v1.0 Platform BFF</Badge>
              </div>
              <p className="text-xs text-[var(--color-text-muted)]">
                {workspace.workspace_name} · Single-Tenant Enterprise Hub
              </p>
            </div>
          </div>

          {/* Shared Infrastructure Status Bar */}
          <div className="hidden xl:flex items-center gap-2">
            <StatusPill status="online" label="PostgreSQL 17 · Drizzle" />
            <StatusPill status="online" label="Redis 7.4 Cache" />
            <StatusPill status="online" label="SeaweedFS S3" />
            <StatusPill
              status="standby"
              label="sineva-ai:8000 (Internal Bridge)"
            />
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => dispatch(setCommandPaletteOpen(true))}
              aria-label="Open Command Palette"
            >
              <CommandIcon className="h-3.5 w-3.5" />
              <span>Command</span>
              <kbd className="ml-1 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-muted)] px-1.5 py-0.5 font-mono text-[11px]">
                ⌘K
              </kbd>
            </Button>

            <Button variant="secondary" size="sm" asChild>
              <Link href="/api-docs">
                <FileCode2 className="h-4 w-4" />
                <span>OpenAPI Docs</span>
              </Link>
            </Button>

            <ThemeToggle />
          </div>
        </Container>
      </header>

      <main className="py-10">
        <Container size="wide" className="space-y-10">
          {/* Editorial Hero & Multi-Agent Orchestrator Telemetry */}
          <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <Card
              elevated
              className="lg:col-span-8 flex flex-col justify-between relative overflow-hidden"
            >
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="sun">Warm Editorial AI Workspace</Badge>
                  <Badge tone="teal">Clean Architecture · Next.js 16</Badge>
                  <Badge tone="neutral">snake_case API Standard</Badge>
                </div>

                <h1 className="text-3xl sm:text-4xl lg:text-[2.65rem] font-bold tracking-tight leading-[1.12]">
                  Orchestrate specialized AI companions with enterprise-grade
                  clarity.
                </h1>

                <p className="max-w-2xl text-base text-[var(--color-text-muted)] leading-relaxed">
                  Sineva unifies six domain-specialized AI companions inside a
                  calm, human-centered workspace. All inference requests route
                  through our isolated internal Docker bridge to{' '}
                  <code className="rounded-md bg-[var(--color-surface-muted)] px-1.5 py-0.5 font-mono text-xs text-[var(--color-action-primary)]">
                    http://sineva-ai:8000
                  </code>{' '}
                  with shared PostgreSQL, Redis, Qdrant, and SeaweedFS S3 persistence.
                </p>
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--color-border)] pt-5">
                <div className="flex flex-wrap items-center gap-6">
                  <div>
                    <p className="text-xs font-medium text-[var(--color-text-muted)]">
                      Active Companions
                    </p>
                    <p className="text-xl font-bold">6 Specialized Agents</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-[var(--color-text-muted)]">
                      Median BFF Latency
                    </p>
                    <p className="text-xl font-bold text-[var(--color-action-primary)]">
                      342 ms
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-[var(--color-text-muted)]">
                      Network Isolation
                    </p>
                    <p className="text-xl font-bold">100% Internal AI Mesh</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant={
                      workspace.orchestrator_mode === 'human_in_the_loop'
                        ? 'primary'
                        : 'secondary'
                    }
                    size="sm"
                    onClick={() =>
                      dispatch(setOrchestratorMode('human_in_the_loop'))
                    }
                  >
                    <ShieldCheck className="h-4 w-4" />
                    <span>Human-in-the-Loop</span>
                  </Button>
                  <Button
                    variant={
                      workspace.orchestrator_mode === 'autonomous_handoff'
                        ? 'primary'
                        : 'secondary'
                    }
                    size="sm"
                    onClick={() =>
                      dispatch(setOrchestratorMode('autonomous_handoff'))
                    }
                  >
                    <Workflow className="h-4 w-4" />
                    <span>Autonomous Handoff</span>
                  </Button>
                </div>
              </div>
            </Card>

            {/* Shared Infrastructure & Token Budget Card */}
            <Card elevated className="lg:col-span-4 flex flex-col justify-between space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                    Shared Infrastructure Mesh
                  </span>
                  <Badge tone="success">All Systems Nominal</Badge>
                </div>

                <div className="space-y-2.5 pt-1">
                  <div className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)]/60 px-3.5 py-2.5 text-xs">
                    <span className="flex items-center gap-2 font-medium">
                      <Database className="h-4 w-4 text-[var(--color-action-primary)]" />
                      PostgreSQL 17 (Drizzle ORM)
                    </span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400">
                      :5432 Shared
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)]/60 px-3.5 py-2.5 text-xs">
                    <span className="flex items-center gap-2 font-medium">
                      <Cpu className="h-4 w-4 text-[var(--color-action-primary)]" />
                      Redis 7.4 + Qdrant Vector
                    </span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400">
                      :6379 / :6333
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)]/60 px-3.5 py-2.5 text-xs">
                    <span className="flex items-center gap-2 font-medium">
                      <HardDrive className="h-4 w-4 text-[var(--color-action-primary)]" />
                      SeaweedFS S3 Object Store
                    </span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400">
                      :8333 Presigned
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 border-t border-[var(--color-border)] pt-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[var(--color-text-muted)]">
                    Workspace Monthly Token Budget
                  </span>
                  <span className="font-mono font-semibold">
                    {workspace.monthly_tokens_consumed.toLocaleString()} /{' '}
                    {workspace.monthly_token_quota.toLocaleString()} ({quotaPercentage}%)
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-muted)]">
                  <div
                    className="h-full rounded-full bg-[var(--color-action-primary)] transition-all duration-300"
                    style={{ width: `${quotaPercentage}%` }}
                  />
                </div>
                <div className="flex items-center justify-between pt-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handlePresignSampleUpload}
                    className="w-full"
                  >
                    <CloudUpload className="h-4 w-4" />
                    <span>Test SeaweedFS S3 Presign API</span>
                  </Button>
                </div>
              </div>
            </Card>
          </section>

          {/* Specialized Companions Roster & Category Filter */}
          <section className="space-y-5" aria-labelledby="companions-heading">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2
                  id="companions-heading"
                  className="text-2xl font-bold tracking-tight"
                >
                  Specialized AI Companions
                </h2>
                <p className="text-sm text-[var(--color-text-muted)]">
                  Select any companion to inspect domain capabilities and dispatch
                  tasks via the BFF gateway.
                </p>
              </div>

              <div
                className="flex flex-wrap items-center gap-1.5"
                role="tablist"
                aria-label="Filter companions by department"
              >
                {CATEGORY_LABELS.map((cat) => {
                  const isActive = active_category_filter === cat.key;
                  return (
                    <button
                      key={cat.key}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => dispatch(setActiveCategoryFilter(cat.key))}
                      className={`min-h-[40px] rounded-xl px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer ${
                        isActive
                          ? 'bg-[var(--color-action-primary)] text-[var(--color-text-inverse)] shadow-xs'
                          : 'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                      }`}
                    >
                      {cat.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {displayedAgents.map((agent) => {
                const isSelected =
                  activeAgent?.agent_slug === agent.agent_slug;
                return (
                  <Card
                    key={agent.id}
                    elevated={isSelected}
                    className={`flex flex-col justify-between transition-all ${
                      isSelected
                        ? 'ring-2 ring-[var(--color-action-primary)] border-transparent'
                        : 'hover:border-[var(--color-border-strong)]'
                    }`}
                  >
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--teal-50)] text-[var(--teal-800)] dark:bg-[var(--teal-900)]/60 dark:text-[var(--teal-100)] font-bold">
                            <Bot className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-base font-bold">
                              @{agent.display_name}
                            </h3>
                            <p className="text-xs text-[var(--color-text-muted)]">
                              {agent.role_title}
                            </p>
                          </div>
                        </div>
                        <Badge
                          tone={
                            agent.status === 'online' ? 'success' : 'warning'
                          }
                        >
                          {agent.status}
                        </Badge>
                      </div>

                      <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
                        {agent.short_description}
                      </p>

                      <div className="flex flex-wrap gap-1.5">
                        {agent.capabilities.map((cap) => (
                          <span
                            key={cap}
                            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-2.5 py-1 font-mono text-[11px] text-[var(--color-text-muted)]"
                          >
                            {cap}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="mt-6 flex items-center justify-between border-t border-[var(--color-border)] pt-4">
                      <div className="flex items-center gap-4 text-xs text-[var(--color-text-muted)]">
                        <span className="flex items-center gap-1 font-mono">
                          <Activity className="h-3.5 w-3.5 text-[var(--color-action-primary)]" />
                          {agent.avg_latency_ms}ms
                        </span>
                        <span>{agent.active_sessions_count} sessions</span>
                      </div>

                      <Button
                        variant={isSelected ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() =>
                          dispatch(setSelectedAgentSlug(agent.agent_slug))
                        }
                      >
                        <span>
                          {isSelected ? 'Active Companion' : 'Select Companion'}
                        </span>
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>

          {/* Interactive Companion Chat & Live snake_case BFF Inspector */}
          {activeAgent && (
            <section
              className="grid grid-cols-1 gap-6 lg:grid-cols-12"
              aria-label="Interactive Companion Workspace"
            >
              {/* Left 7 Cols: Interactive Companion Session */}
              <Card elevated className="lg:col-span-7 flex flex-col justify-between space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-action-primary)] text-[var(--color-text-inverse)]">
                      <Bot className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold">
                          @{activeAgent.display_name} Interactive Session
                        </h3>
                        <Badge tone="teal">{activeAgent.model_name}</Badge>
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        POST /api/v1/agents/{activeAgent.agent_slug}/chat →
                        Internal Gateway (http://sineva-ai:8000)
                      </p>
                    </div>
                  </div>
                </div>

                {/* Message List */}
                <div className="max-h-[420px] min-h-[280px] space-y-4 overflow-y-auto pr-1">
                  {activeTranscript.length === 0 ? (
                    <div className="flex h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--color-border-strong)] p-6 text-center">
                      <Layers className="h-8 w-8 text-[var(--color-action-primary)] mb-2" />
                      <p className="text-sm font-semibold">
                        Start a thread with @{activeAgent.display_name}
                      </p>
                      <p className="mt-1 max-w-md text-xs text-[var(--color-text-muted)]">
                        Ask a domain question below to test the Clean Architecture
                        use case and inspect the standardized snake_case response
                        envelope.
                      </p>
                    </div>
                  ) : (
                    activeTranscript.map((item) => (
                      <div
                        key={item.id}
                        className={`rounded-2xl p-4 ${
                          item.sender_role === 'user'
                            ? 'ml-8 bg-[var(--color-action-primary)] text-[var(--color-text-inverse)]'
                            : 'mr-4 border border-[var(--color-border)] bg-[var(--color-surface-muted)]/60'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs opacity-80 mb-1.5">
                          <span className="font-semibold">
                            {item.sender_role === 'user'
                              ? 'You (Workspace Executive)'
                              : `@${activeAgent.display_name}`}
                          </span>
                          {item.latency_ms && (
                            <span className="font-mono">
                              {item.latency_ms}ms · {item.tokens_used} tokens
                            </span>
                          )}
                        </div>

                        <p className="text-sm leading-relaxed">
                          {item.message_text}
                        </p>

                        {item.reasoning_summary && (
                          <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5 text-xs text-[var(--color-text-muted)]">
                            <span className="font-semibold text-[var(--color-text)]">
                              Reasoning Trace:{' '}
                            </span>
                            {item.reasoning_summary}
                          </div>
                        )}

                        {item.suggested_actions &&
                          item.suggested_actions.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {item.suggested_actions.map((act) => (
                                <button
                                  key={act}
                                  type="button"
                                  onClick={() => setPromptInput(act)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-elevated)] px-2.5 py-1 text-xs font-medium text-[var(--color-text)] hover:border-[var(--color-action-primary)] cursor-pointer"
                                >
                                  <CheckCircle2 className="h-3 w-3 text-[var(--color-action-primary)]" />
                                  <span>{act}</span>
                                </button>
                              ))}
                            </div>
                          )}
                      </div>
                    ))
                  )}
                </div>

                {/* Chat Input Form */}
                <form
                  onSubmit={handleSendPrompt}
                  className="flex flex-col gap-3 sm:flex-row sm:items-center border-t border-[var(--color-border)] pt-4"
                >
                  <label htmlFor="companion-prompt-input" className="sr-only">
                    Message @{activeAgent.display_name}
                  </label>
                  <input
                    id="companion-prompt-input"
                    type="text"
                    value={promptInput}
                    onChange={(e) => setPromptInput(e.target.value)}
                    placeholder={`Ask @${activeAgent.display_name} to analyze telemetry, reconcile data, or draft a playbook...`}
                    className="min-h-[44px] flex-1 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-4 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus:border-[var(--color-action-primary)] focus:outline-hidden"
                  />
                  <Button
                    type="submit"
                    disabled={is_dispatching_message || !promptInput.trim()}
                  >
                    <Send className="h-4 w-4" />
                    <span>
                      {is_dispatching_message
                        ? 'Dispatching...'
                        : 'Send to Companion'}
                    </span>
                  </Button>
                </form>
              </Card>

              {/* Right 5 Cols: Standardized snake_case API Contract Inspector */}
              <Card elevated className="lg:col-span-5 flex flex-col justify-between space-y-4">
                <div className="space-y-1 border-b border-[var(--color-border)] pb-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold">
                      Standardized `snake_case` BFF Envelope
                    </h3>
                    <Badge tone="teal">@sineva/shared</Badge>
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    Every API response strictly follows the `success`, `status`,
                    `message`, `data`, `meta`, `errors` contract.
                  </p>
                </div>

                <pre className="max-h-[420px] flex-1 overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--ink-950)] p-4 font-mono text-xs text-emerald-300 leading-relaxed">
                  {lastApiEnvelope ??
                    JSON.stringify(
                      {
                        success: true,
                        status: 200,
                        message: 'Companion standing by for BFF dispatch',
                        data: {
                          selected_agent_slug: activeAgent.agent_slug,
                          internal_gateway: 'http://sineva-ai:8000/api/v1',
                          shared_storage:
                            presignPreview !== null
                              ? 'seaweedfs_s3_presigned'
                              : 'seaweedfs_s3_ready',
                        },
                        meta: {
                          page: 1,
                          per_page: 10,
                          total_items: 6,
                          total_pages: 1,
                          has_next: false,
                          has_prev: false,
                          request_id: 'req_sineva_ready_001',
                          timestamp: '2026-10-20T17:00:00.000Z',
                        },
                        errors: null,
                      },
                      null,
                      2,
                    )}
                </pre>

                <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)] pt-1">
                  <span>OpenAPI 3.1 Specification Ready</span>
                  <Link
                    href="/api-docs"
                    className="font-semibold text-[var(--color-action-primary)] hover:underline"
                  >
                    Explore full Swagger UI →
                  </Link>
                </div>
              </Card>
            </section>
          )}
        </Container>
      </main>
    </div>
  );
}
