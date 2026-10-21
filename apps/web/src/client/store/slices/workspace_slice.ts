import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface WorkspaceSliceState {
  workspace_id: string;
  workspace_slug: string;
  workspace_name: string;
  subscription_tier: 'starter' | 'growth' | 'enterprise';
  monthly_token_quota: number;
  monthly_tokens_consumed: number;
  orchestrator_mode: 'autonomous_handoff' | 'human_in_the_loop';
}

const initialState: WorkspaceSliceState = {
  workspace_id: 'wks_sineva_enterprise_01',
  workspace_slug: 'sineva-global-hq',
  workspace_name: 'Sineva Global HQ',
  subscription_tier: 'enterprise',
  monthly_token_quota: 5_000_000,
  monthly_tokens_consumed: 1_391_250,
  orchestrator_mode: 'human_in_the_loop',
};

export const workspaceSlice = createSlice({
  name: 'workspace',
  initialState,
  reducers: {
    incrementTokensConsumed(state, action: PayloadAction<number>) {
      state.monthly_tokens_consumed += Math.max(0, action.payload);
    },
    setOrchestratorMode(
      state,
      action: PayloadAction<'autonomous_handoff' | 'human_in_the_loop'>,
    ) {
      state.orchestrator_mode = action.payload;
    },
    resetWorkspaceClientState() {
      // FR-AUTH-35: Reset client state on workspace switch to prevent cross-tenant data bleed
      return initialState;
    },
  },
});

export const { incrementTokensConsumed, setOrchestratorMode, resetWorkspaceClientState } =
  workspaceSlice.actions;

export default workspaceSlice.reducer;
