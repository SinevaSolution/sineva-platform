import { describe, expect, it } from 'vitest';
import {
  appendChatTranscript,
  setChatSessionId,
  setActiveCategoryFilter,
  setSelectedAgentSlug,
} from '@/client/store/slices/agent_slice';
import {
  incrementTokensConsumed,
  setOrchestratorMode,
} from '@/client/store/slices/workspace_slice';
import { makeStore } from '@/client/store/store';

describe('Redux Toolkit Store Slices', () => {
  it('manages selected agent companion, category filter, and chat transcripts', () => {
    const store = makeStore();
    expect(store.getState().agent_companion.selected_agent_slug).toBe(
      'sinofinance',
    );

    store.dispatch(setSelectedAgentSlug('sinopeople'));
    store.dispatch(setActiveCategoryFilter('people_hr'));
    store.dispatch(
      appendChatTranscript({
        id: 'msg_test_99',
        agent_slug: 'sinopeople',
        sender_role: 'user',
        message_text: 'Score 5 backend engineering candidates',
        created_at: '2026-10-20T10:00:00.000Z',
      }),
    );

    const state = store.getState().agent_companion;
    expect(state.selected_agent_slug).toBe('sinopeople');
    expect(state.active_category_filter).toBe('people_hr');
    expect(state.transcripts_by_slug['sinopeople']?.length).toBe(1);
  });

  it('starts with no fabricated transcripts and remembers the sineva-ai session per companion', () => {
    const store = makeStore();
    expect(store.getState().agent_companion.transcripts_by_slug).toEqual({});
    expect(store.getState().agent_companion.session_ids_by_slug).toEqual({});

    store.dispatch(
      setChatSessionId({
        agent_slug: 'sinofinance',
        session_id: '8f3a1c2d-6b4e-4d7a-9c15-2e0b7a41f9d3',
      }),
    );

    expect(
      store.getState().agent_companion.session_ids_by_slug['sinofinance'],
    ).toBe('8f3a1c2d-6b4e-4d7a-9c15-2e0b7a41f9d3');
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
