// @vitest-environment jsdom
import * as React from 'react';
import { Provider } from 'react-redux';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONVERSATION_TITLE_MAX,
  resolveTitleEdit,
} from '@/client/components/conversation/conversation_title';
import { InlineTitleEdit } from '@/client/components/conversation/inline_title_edit';
import { useConversationActions } from '@/client/components/conversation/use_conversation_actions';
import { ApiError } from '@/client/lib/api';
import { makeStore } from '@/client/store/store';
import { CATALOGS } from '@/i18n/catalogs';
import { I18nProvider } from '@/i18n/provider';

const apiRequest = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const nav = vi.hoisted(() => ({ pathname: '/w/acme/new', replace: vi.fn() }));

vi.mock('@/client/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/client/lib/api')>()),
  apiRequest,
}));
vi.mock('sonner', () => ({ toast }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ replace: nav.replace }),
}));

afterEach(cleanup);

describe('resolveTitleEdit', () => {
  it('saves a changed title, trimmed', () => {
    expect(resolveTitleEdit('Old', '  New name  ')).toEqual({ kind: 'save', title: 'New name' });
  });

  it('cancels when the title is empty, blank or unchanged', () => {
    expect(resolveTitleEdit('Old', '')).toEqual({ kind: 'cancel' });
    expect(resolveTitleEdit('Old', '    ')).toEqual({ kind: 'cancel' });
    expect(resolveTitleEdit('Old', ' Old ')).toEqual({ kind: 'cancel' });
  });

  it('saves a first title when there was none', () => {
    expect(resolveTitleEdit(null, 'Hello')).toEqual({ kind: 'save', title: 'Hello' });
  });

  it('clamps to the server limit instead of sending a title the API would refuse', () => {
    const result = resolveTitleEdit('Old', 'x'.repeat(CONVERSATION_TITLE_MAX + 30));
    expect(result).toEqual({ kind: 'save', title: 'x'.repeat(CONVERSATION_TITLE_MAX) });
  });
});

describe('InlineTitleEdit', () => {
  function setup(value: string | null = 'Old title') {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(<InlineTitleEdit value={value} label="Chat name" onSave={onSave} onCancel={onCancel} />);
    const input = screen.getByRole('textbox', { name: 'Chat name' }) as HTMLInputElement;
    return { input, onSave, onCancel };
  }

  it('starts focused with the current title selected', () => {
    const { input } = setup();
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('Old title');
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe('Old title'.length);
  });

  it('Enter saves the trimmed draft once', () => {
    const { input, onSave, onCancel } = setup();
    fireEvent.change(input, { target: { value: '  Renamed  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    // Unmounting the input in the parent fires blur; it must not save twice.
    fireEvent.blur(input);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('Renamed');
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('Escape cancels without saving, even though blur follows', () => {
    const { input, onSave, onCancel } = setup();
    fireEvent.change(input, { target: { value: 'Something else' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.blur(input);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('blur saves a changed draft', () => {
    const { input, onSave } = setup();
    fireEvent.change(input, { target: { value: 'By blur' } });
    fireEvent.blur(input);
    expect(onSave).toHaveBeenCalledWith('By blur');
  });

  it('cancels instead of saving when the draft is empty or unchanged', () => {
    const first = setup();
    fireEvent.change(first.input, { target: { value: '   ' } });
    fireEvent.keyDown(first.input, { key: 'Enter' });
    expect(first.onSave).not.toHaveBeenCalled();
    expect(first.onCancel).toHaveBeenCalledTimes(1);
    cleanup();

    const second = setup();
    fireEvent.blur(second.input);
    expect(second.onSave).not.toHaveBeenCalled();
    expect(second.onCancel).toHaveBeenCalledTimes(1);
  });

  it('limits the input length to the API maximum', () => {
    const { input } = setup();
    expect(input.maxLength).toBe(CONVERSATION_TITLE_MAX);
  });

  it('does not let Enter or Escape bubble to a surrounding link or dialog', () => {
    const parentKey = vi.fn();
    const onSave = vi.fn();
    render(
      <div onKeyDown={parentKey}>
        <InlineTitleEdit value="A" label="Chat name" onSave={onSave} onCancel={() => {}} />
      </div>,
    );
    const input = screen.getByRole('textbox', { name: 'Chat name' });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(parentKey).not.toHaveBeenCalled();
  });
});

describe('useConversationActions', () => {
  let store: ReturnType<typeof makeStore>;

  function hook() {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>
        <I18nProvider locale="en" messages={CATALOGS.en}>
          {children}
        </I18nProvider>
      </Provider>
    );
    return renderHook(() => useConversationActions({ workspaceId: 'ws-1', workspaceSlug: 'acme' }), {
      wrapper,
    });
  }

  beforeEach(() => {
    store = makeStore();
    vi.clearAllMocks();
    nav.pathname = '/w/acme/new';
  });

  describe('rename', () => {
    it('applies the new title at once, PATCHes it and keeps the server title', async () => {
      apiRequest.mockResolvedValue({ id: 'c1', title: 'Budget' });
      const apply = vi.fn();
      const { result } = hook();
      let ok = false;
      await act(async () => {
        ok = await result.current.rename('c1', 'Budget', { previous: 'Old', apply });
      });
      expect(ok).toBe(true);
      expect(apply).toHaveBeenNthCalledWith(1, 'Budget');
      expect(apiRequest).toHaveBeenCalledWith('/api/v1/workspaces/ws-1/conversations/c1', {
        method: 'PATCH',
        body: { title: 'Budget' },
      });
      expect(apply).toHaveBeenLastCalledWith('Budget');
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('refreshes the other chat lists after a rename', async () => {
      apiRequest.mockResolvedValue({ id: 'c1', title: 'Budget' });
      const before = store.getState().ui.chats_version;
      const { result } = hook();
      await act(async () => {
        await result.current.rename('c1', 'Budget', { previous: 'Old', apply: vi.fn() });
      });
      expect(store.getState().ui.chats_version).toBe(before + 1);
    });

    it('rolls back to the previous title and toasts when the call fails', async () => {
      apiRequest.mockRejectedValue(new ApiError('nope', 500, 'internal_error'));
      const apply = vi.fn();
      const { result } = hook();
      let ok = true;
      await act(async () => {
        ok = await result.current.rename('c1', 'Budget', { previous: 'Old', apply });
      });
      expect(ok).toBe(false);
      expect(apply).toHaveBeenNthCalledWith(1, 'Budget');
      expect(apply).toHaveBeenLastCalledWith('Old');
      expect(toast.error).toHaveBeenCalledTimes(1);
    });
  });

  describe('remove', () => {
    it('DELETEs, refreshes the lists and toasts success', async () => {
      apiRequest.mockResolvedValue({ id: 'c1', deleted: true });
      const before = store.getState().ui.chats_version;
      const { result } = hook();
      let ok = false;
      await act(async () => {
        ok = await result.current.remove('c1');
      });
      expect(ok).toBe(true);
      expect(apiRequest).toHaveBeenCalledWith('/api/v1/workspaces/ws-1/conversations/c1', {
        method: 'DELETE',
      });
      expect(store.getState().ui.chats_version).toBe(before + 1);
      expect(toast.success).toHaveBeenCalledWith('Chat deleted');
      expect(nav.replace).not.toHaveBeenCalled();
    });

    it('leaves the chat being viewed for a new chat', async () => {
      nav.pathname = '/w/acme/chat/c1';
      apiRequest.mockResolvedValue({ id: 'c1', deleted: true });
      const { result } = hook();
      await act(async () => {
        await result.current.remove('c1');
      });
      expect(nav.replace).toHaveBeenCalledWith('/w/acme/new');
    });

    it('stays put when another chat is deleted', async () => {
      nav.pathname = '/w/acme/chat/c2';
      apiRequest.mockResolvedValue({ id: 'c1', deleted: true });
      const { result } = hook();
      await act(async () => {
        await result.current.remove('c1');
      });
      expect(nav.replace).not.toHaveBeenCalled();
    });

    it('keeps everything and toasts when the call fails', async () => {
      nav.pathname = '/w/acme/chat/c1';
      apiRequest.mockRejectedValue(new ApiError('nope', 500, 'internal_error'));
      const before = store.getState().ui.chats_version;
      const { result } = hook();
      let ok = true;
      await act(async () => {
        ok = await result.current.remove('c1');
      });
      expect(ok).toBe(false);
      expect(toast.error).toHaveBeenCalledTimes(1);
      expect(toast.success).not.toHaveBeenCalled();
      expect(nav.replace).not.toHaveBeenCalled();
      expect(store.getState().ui.chats_version).toBe(before);
    });
  });
});
