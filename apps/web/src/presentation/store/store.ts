import { configureStore } from '@reduxjs/toolkit';
import agentReducer from './slices/agent_slice';
import workspaceReducer from './slices/workspace_slice';

export function makeStore() {
  return configureStore({
    reducer: {
      agent_companion: agentReducer,
      workspace: workspaceReducer,
    },
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
