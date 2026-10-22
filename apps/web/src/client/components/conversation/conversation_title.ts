// Must match RenameConversationSchema on the server (conversation_dto.ts);
// the client cannot import `@/server`, so the number lives in both places.
export const CONVERSATION_TITLE_MAX = 120;

export type TitleEdit = { kind: 'save'; title: string } | { kind: 'cancel' };

/**
 * Decides what finishing an inline rename means. Empty and unchanged drafts
 * are a cancel, not an error: the API refuses an empty title with a 422, and
 * a request that changes nothing is noise (and an audit row). The input also
 * has `maxLength`, so the clamp only matters for pasted text on odd browsers.
 */
export function resolveTitleEdit(current: string | null, draft: string): TitleEdit {
  const title = draft.trim().slice(0, CONVERSATION_TITLE_MAX).trim();
  if (title === '' || title === (current ?? '').trim()) return { kind: 'cancel' };
  return { kind: 'save', title };
}
