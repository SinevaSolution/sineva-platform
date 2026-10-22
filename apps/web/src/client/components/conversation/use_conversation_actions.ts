'use client';

import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';
import { snToast } from '@sineva/ui';
import { ApiError, apiRequest } from '@/client/lib/api';
import { useApiErrorText } from '@/client/lib/use_api_error';
import { useAppDispatch } from '@/client/store/hooks';
import { chatsChanged } from '@/client/store/slices/ui_slice';
import { useTranslations } from '@/i18n/provider';

export interface RenameOptions {
  /** The title to go back to if the server refuses. */
  previous: string | null;
  /** Puts a title on screen in the surface that owns the list or header. */
  apply: (title: string | null) => void;
}

/**
 * Rename and delete for one chat, shared by the sidebar, Home and the chat
 * header. The surface keeps its own copy of the title (each loads its own
 * data), so rename is optimistic through `apply` and rolls back on failure;
 * `chatsChanged` then refreshes the other surfaces from the server.
 */
export function useConversationActions({
  workspaceId,
  workspaceSlug,
}: {
  workspaceId: string;
  workspaceSlug: string;
}) {
  const t = useTranslations('conversation');
  const errorText = useApiErrorText();
  const dispatch = useAppDispatch();
  const router = useRouter();
  const pathname = usePathname();
  const base = `/api/v1/workspaces/${workspaceId}/conversations`;

  const rename = React.useCallback(
    async (id: string, title: string, { previous, apply }: RenameOptions): Promise<boolean> => {
      apply(title);
      try {
        const updated = await apiRequest<{ title: string | null }>(`${base}/${id}`, {
          method: 'PATCH',
          body: { title },
        });
        apply(updated.title ?? title);
        dispatch(chatsChanged());
        return true;
      } catch (error) {
        apply(previous);
        snToast.error(errorText(error));
        return false;
      }
    },
    // `errorText` is rebuilt every render; it only closes over the translator.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, dispatch],
  );

  const remove = React.useCallback(
    async (id: string): Promise<boolean> => {
      try {
        await apiRequest(`${base}/${id}`, { method: 'DELETE' });
      } catch (error) {
        // Already gone (another tab): the lists are stale, so refresh them too.
        if (error instanceof ApiError && error.status === 404) dispatch(chatsChanged());
        snToast.error(errorText(error));
        return false;
      }
      dispatch(chatsChanged());
      snToast.success(t('deleted'));
      // Never leave the person on a chat that no longer exists.
      if (pathname === `/w/${workspaceSlug}/chat/${id}`) router.replace(`/w/${workspaceSlug}/new`);
      return true;
    },
    // `errorText` and `t` are rebuilt every render and close over the translator only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, dispatch, pathname, router, workspaceSlug],
  );

  return { rename, remove };
}
