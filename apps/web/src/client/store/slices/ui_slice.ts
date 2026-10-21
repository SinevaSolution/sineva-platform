import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

// Client-only UI state shared between distant components (the top bar's menu
// button and the sidebar drawer). Server data (workspaces, specialists,
// conversations) is not stored here: it comes from server components as props
// and from route handlers, so there is one source of truth for it.
export interface UiState {
  collapsed_sections: string[];
  mobile_nav_open: boolean;
  /** Bumped when a chat is created so the Recent chats list refetches. */
  chats_version: number;
}

const initialState: UiState = {
  collapsed_sections: [],
  mobile_nav_open: false,
  chats_version: 0,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleSidebarSection(state, action: PayloadAction<string>) {
      const id = action.payload;
      state.collapsed_sections = state.collapsed_sections.includes(id)
        ? state.collapsed_sections.filter((s) => s !== id)
        : [...state.collapsed_sections, id];
    },
    setMobileNavOpen(state, action: PayloadAction<boolean>) {
      state.mobile_nav_open = action.payload;
    },
    chatsChanged(state) {
      state.chats_version += 1;
    },
  },
});

export const { toggleSidebarSection, setMobileNavOpen, chatsChanged } = uiSlice.actions;
export default uiSlice.reducer;
