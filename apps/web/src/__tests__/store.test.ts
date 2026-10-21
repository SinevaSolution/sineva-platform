import { describe, expect, it } from 'vitest';
import {
  chatsChanged,
  setMobileNavOpen,
  toggleSidebarSection,
} from '@/client/store/slices/ui_slice';
import { makeStore } from '@/client/store/store';

describe('Redux store', () => {
  it('holds only client UI state', () => {
    const store = makeStore();
    expect(Object.keys(store.getState())).toEqual(['ui']);
  });

  it('collapses and expands sidebar sections and the mobile drawer', () => {
    const store = makeStore();
    store.dispatch(toggleSidebarSection('specialists'));
    expect(store.getState().ui.collapsed_sections).toEqual(['specialists']);
    store.dispatch(setMobileNavOpen(true));
    expect(store.getState().ui.mobile_nav_open).toBe(true);
  });

  it('bumps the chats version so the recent chats list refetches', () => {
    const store = makeStore();
    const before = store.getState().ui.chats_version;
    store.dispatch(chatsChanged());
    expect(store.getState().ui.chats_version).toBe(before + 1);
  });
});
