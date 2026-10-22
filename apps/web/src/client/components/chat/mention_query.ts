const MAX_RESULTS = 8;

/**
 * The `@token` the caret sits at the end of, or null. The `@` must start the
 * text or follow whitespace, so "email@x" never opens the menu; the token is
 * letters and digits only, so a space closes it.
 */
export function activeMention(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const match = /(^|\s)@([\p{L}\p{N}]*)$/u.exec(before);
  if (!match) return null;
  const query = match[2] ?? '';
  return { start: caret - query.length - 1, query };
}

/**
 * Display-name prefix matches first, then matches anywhere in name, slug or
 * role. Two passes (not a sort) keep the original order inside each group.
 */
export function filterSpecialists<T extends { agent_slug: string; display_name: string; role_title: string }>(
  list: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return list.slice(0, MAX_RESULTS);
  const prefix = list.filter((s) => s.display_name.toLowerCase().startsWith(q));
  const rest = list.filter(
    (s) =>
      !prefix.includes(s) &&
      [s.display_name, s.agent_slug, s.role_title].some((f) => f.toLowerCase().includes(q)),
  );
  return [...prefix, ...rest].slice(0, MAX_RESULTS);
}

/** Swaps the token [start, caret) for `@DisplayName ` and returns the caret after the space. */
export function applyMention(
  text: string,
  start: number,
  caret: number,
  displayName: string,
): { text: string; caret: number } {
  const after = text.slice(caret);
  const insert = `@${displayName}`;
  // A space already after the caret is reused, so we never leave two.
  const needsSpace = !after.startsWith(' ');
  const next = `${text.slice(0, start)}${insert}${needsSpace ? ' ' : ''}${after}`;
  return { text: next, caret: start + insert.length + 1 };
}
