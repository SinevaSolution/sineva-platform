import { describe, expect, it } from 'vitest';
import {
  appendChatTranscript,
  setActiveCategoryFilter,
  setSelectedAgentSlug,
} from '@/presentation/store/slices/agent_slice';
import {
  incrementTokensConsumed,
  setOrchestratorMode,
} from '@/presentation/store/slices/workspace_slice';
import { makeStore } from '@/presentation/store/store';

describe('Redux Toolkit Store Slices', () => {
  it('manages selected agent companion, category filter, and chat transcripts', () => {
    const store = makeStore();
    expect(store.getState().agent_companion.selected_agent_slug).toBe(
      'sino-finance',
    );

    store.dispatch(setSelectedAgentSlug('sino-people'));
    store.dispatch(setActiveCategoryFilter('people_hr'));
    store.dispatch(
      appendChatTranscript({
        id: 'msg_test_99',
        agent_slug: 'sino-people',
        sender_role: 'user',
        message_text: 'Score 5 backend engineering candidates',
        created_at: '2026-10-20T10:00:00.000Z',
      }),
    );

    const state = store.getState().agent_companion;
    expect(state.selected_agent_slug).toBe('sino-people');
    expect(state.active_category_filter).toBe('people_hr');
    expect(state.transcripts_by_slug['sino-people']?.length).toBe(2);
  });

  it('tracks workspace token budget and orchestrator mode transitions', () => {
    const store = makeStore();
    const initialTokens = store.getState().workspace.monthly_tokens_consumed;

    store.dispatch(incrementTokensConsumed(500));
    store.dispatch(setOrchestratorMode('autonomous_handoff'));

    const ws = store.getState().workspace;
    expect(ws.monthly_tokens_consumed).toBe(initialTokens + 500);
    expect(ws.orchestrator_mode).toBe('autonomous_handoff');
  });
});
