/**
 * Adds `@Name ` to the front of a draft (R-36: mention first, no comma).
 * A specialist already mentioned is left alone, so tapping a chip twice
 * never doubles it.
 */
export function insertMention(draft: string, displayName: string): string {
  const token = `@${displayName}`;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`(^|\\s)${escaped}(?=\\s|$)`).test(draft)) return draft;
  const rest = draft.trimStart();
  return rest ? `${token} ${rest}` : `${token} `;
}
