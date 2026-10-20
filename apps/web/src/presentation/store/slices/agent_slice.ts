import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { AgentCategory, AgentEntity } from '@/domain/entities/agent';

export interface ChatTranscriptItem {
  id: string;
  agent_slug: string;
  sender_role: 'user' | 'agent';
  message_text: string;
  reasoning_summary?: string;
  suggested_actions?: string[];
  tokens_used?: number;
  latency_ms?: number;
  created_at: string;
}

export interface AgentSliceState {
  selected_agent_slug: string;
  active_category_filter: AgentCategory | 'all';
  command_palette_open: boolean;
  is_dispatching_message: boolean;
  transcripts_by_slug: Record<string, ChatTranscriptItem[]>;
  agents_catalog: AgentEntity[];
}

const initialState: AgentSliceState = {
  selected_agent_slug: 'sino-finance',
  active_category_filter: 'all',
  command_palette_open: false,
  is_dispatching_message: false,
  agents_catalog: [],
  transcripts_by_slug: {
    'sino-finance': [
      {
        id: 'msg_seed_01',
        agent_slug: 'sino-finance',
        sender_role: 'agent',
        message_text:
          'Good morning! I reconciled the October multi-currency ledger across PostgreSQL and SeaweedFS invoice archives. Net burn decreased 8.4% MoM, extending cash runway to 22.5 months.',
        reasoning_summary:
          'Verified 142 Stripe & Wise settlement rows against Drizzle ORM ledger_entries.',
        suggested_actions: [
          'Download Q4 Board Cashflow Brief',
          'Inspect 2 flagged SaaS renewals',
          'Simulate +3 engineering hires on runway',
        ],
        tokens_used: 164,
        latency_ms: 310,
        created_at: '2026-10-20T09:00:00.000Z',
      },
    ],
    'sino-people': [
      {
        id: 'msg_seed_02',
        agent_slug: 'sino-people',
        sender_role: 'agent',
        message_text:
          'Hello! 14 Staff AI Engineer candidates have been scored against our rubric. Top 3 candidates exceeded the 92% technical architecture threshold.',
        reasoning_summary:
          'Evaluated CV portfolios and system design transcripts in Qdrant.',
        suggested_actions: [
          'Review top 3 candidate scorecards',
          'Send calendar invites to hiring panel',
        ],
        tokens_used: 128,
        latency_ms: 280,
        created_at: '2026-10-20T09:05:00.000Z',
      },
    ],
  },
};

export const agentSlice = createSlice({
  name: 'agent_companion',
  initialState,
  reducers: {
    setSelectedAgentSlug(state, action: PayloadAction<string>) {
      state.selected_agent_slug = action.payload;
    },
    setActiveCategoryFilter(
      state,
      action: PayloadAction<AgentCategory | 'all'>,
    ) {
      state.active_category_filter = action.payload;
    },
    setCommandPaletteOpen(state, action: PayloadAction<boolean>) {
      state.command_palette_open = action.payload;
    },
    setAgentsCatalog(state, action: PayloadAction<AgentEntity[]>) {
      state.agents_catalog = action.payload;
    },
    setDispatchingMessage(state, action: PayloadAction<boolean>) {
      state.is_dispatching_message = action.payload;
    },
    appendChatTranscript(state, action: PayloadAction<ChatTranscriptItem>) {
      const item = action.payload;
      const list = state.transcripts_by_slug[item.agent_slug] ?? [];
      list.push(item);
      state.transcripts_by_slug[item.agent_slug] = list;
    },
  },
});

export const {
  setSelectedAgentSlug,
  setActiveCategoryFilter,
  setCommandPaletteOpen,
  setAgentsCatalog,
  setDispatchingMessage,
  appendChatTranscript,
} = agentSlice.actions;

export default agentSlice.reducer;
