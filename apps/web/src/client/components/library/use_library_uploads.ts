'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { uploadLibraryFile, type LibraryUploadSession } from '@/client/lib/library_upload';
import { useApiErrorText } from '@/client/lib/use_api_error';

export type LibraryUploadStatus = 'waiting' | 'uploading' | 'sent' | 'failed';

export interface LibraryUploadItem {
  id: string;
  file: File;
  /** The collection the file was dropped on, kept so changing view mid-upload cannot redirect it. */
  folderId: string | null;
  status: LibraryUploadStatus;
  /** Text ready to show, already in the UI language. */
  error?: string;
}

/** How long a finished card stays before the document list takes over. */
export const SENT_LINGER_MS = 5000;

/**
 * Upload queue behind the drop zone. Files start by themselves, one at a time
 * (a presign, a PUT and a complete each), and keep their own cards. A retry
 * reuses the session of that file, so a file whose bytes already reached
 * storage only repeats the last step instead of uploading again. No scopes are
 * sent: a new file takes its collection's access (ADR-0033). The page refreshes
 * once per batch, not once per file.
 */
export function useLibraryUploads(workspaceId: string) {
  const router = useRouter();
  const errorText = useApiErrorText();
  const [items, setItems] = React.useState<LibraryUploadItem[]>([]);
  // The ref is what the pump reads (it runs across awaits); the state is what renders.
  const itemsRef = React.useRef<LibraryUploadItem[]>([]);
  const sessions = React.useRef(new Map<string, LibraryUploadSession>());
  const timers = React.useRef(new Set<number>());
  const running = React.useRef(false);

  const commit = React.useCallback((next: LibraryUploadItem[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);
  const patch = React.useCallback(
    (id: string, change: Partial<LibraryUploadItem>) =>
      commit(itemsRef.current.map((item) => (item.id === id ? { ...item, ...change } : item))),
    [commit],
  );
  const remove = React.useCallback(
    (id: string) => {
      sessions.current.delete(id);
      commit(itemsRef.current.filter((item) => item.id !== id));
    },
    [commit],
  );

  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) window.clearTimeout(timer);
    };
  }, []);

  const pump = React.useCallback(async () => {
    if (running.current) return;
    running.current = true;
    let uploaded = false;
    try {
      for (;;) {
        const next = itemsRef.current.find((item) => item.status === 'waiting');
        if (!next) break;
        patch(next.id, { status: 'uploading', error: undefined });
        const session = sessions.current.get(next.id) ?? {};
        sessions.current.set(next.id, session);
        try {
          await uploadLibraryFile(workspaceId, next.file, { folder_id: next.folderId }, session);
          patch(next.id, { status: 'sent' });
          uploaded = true;
          const timer = window.setTimeout(() => {
            timers.current.delete(timer);
            remove(next.id);
          }, SENT_LINGER_MS);
          timers.current.add(timer);
        } catch (error) {
          patch(next.id, { status: 'failed', error: errorText(error) });
        }
      }
    } finally {
      running.current = false;
    }
    if (uploaded) router.refresh();
  }, [errorText, patch, remove, router, workspaceId]);

  const add = React.useCallback(
    (files: File[], folderId: string | null) => {
      const fresh = files.map((file) => ({
        id: crypto.randomUUID(),
        file,
        folderId,
        status: 'waiting' as const,
      }));
      commit([...itemsRef.current, ...fresh]);
      void pump();
    },
    [commit, pump],
  );

  const retry = React.useCallback(
    (id: string) => {
      patch(id, { status: 'waiting', error: undefined });
      void pump();
    },
    [patch, pump],
  );

  return { items, add, retry, remove, active: items.some((item) => item.status === 'waiting' || item.status === 'uploading') };
}
