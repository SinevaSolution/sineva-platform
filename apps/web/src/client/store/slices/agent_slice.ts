import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { AgentCategory, AgentView } from '@/shared/agent_view';
import type { ChatCitationView } from '@/shared/chat_view';

export interface ChatTranscriptItem {
  id: string;
  agent_slug: string;
  sender_role: 'user' | 'agent';
  message_text: string;
  citations?: ChatCitationView[];
  total_tokens?: number;
  latency_ms?: number;
  created_at: string;
}

export interface AgentSliceState {
  selected_agent_slug: string;
  active_category_filter: AgentCategory | 'all';
  command_palette_open: boolean;
  is_dispatching_message: boolean;
  transcripts_by_slug: Record<string, ChatTranscriptItem[]>;
  // sineva-ai creates the session on the first turn; later turns send the id
  // it returned so the conversation continues.
  session_ids_by_slug: Record<string, string>;
  agents_catalog: AgentView[];
}

const initialState: AgentSliceState = {
  selected_agent_slug: 'sinofinance',
  active_category_filter: 'all',
  command_palette_open: false,
  is_dispatching_message: false,
  agents_catalog: [],
  transcripts_by_slug: {},
  session_ids_by_slug: {},
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
    setAgentsCatalog(state, action: PayloadAction<AgentView[]>) {
      state.agents_catalog = action.payload;
    },
    setDispatchingMessage(state, action: PayloadAction<boolean>) {
      state.is_dispatching_message = action.payload;
    },
    setChatSessionId(
      state,
      action: PayloadAction<{ agent_slug: string; session_id: string }>,
    ) {
      state.session_ids_by_slug[action.payload.agent_slug] =
        action.payload.session_id;
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
  setChatSessionId,
} = agentSlice.actions;

export default agentSlice.reducer;
