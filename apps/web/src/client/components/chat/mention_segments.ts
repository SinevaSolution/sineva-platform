// Splits a draft into plain text and known @mentions so the composer can draw
// pills behind the textarea. Only names of real specialists become pills:
// "@abc" stays text, and so does "me@SinoHelp.id" (the @ must start the text
// or follow whitespace). Every character is kept, in order, because the
// overlay must wrap exactly like the textarea above it.

export type Segment = { text: string; mention: boolean };

function mentionPattern(names: string[]): RegExp | null {
  if (names.length === 0) return null;
  const alternatives = [...names]
    // Longest first, so "SinoHelpDesk" would win over "SinoHelp".
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  // The lookahead stops "@SinoHelper" from matching "@SinoHelp".
  return new RegExp(`(^|\\s)(@(?:${alternatives}))(?=$|[\\s.,!?;:)])`, 'giu');
}

export function splitMentions(text: string, names: string[]): Segment[] {
  const pattern = mentionPattern(names);
  const out: Segment[] = [];
  let last = 0;
  if (pattern) {
    for (const m of text.matchAll(pattern)) {
      const start = (m.index ?? 0) + m[1].length;
      if (start > last) out.push({ text: text.slice(last, start), mention: false });
      out.push({ text: m[2], mention: true });
      last = start + m[2].length;
    }
  }
  if (last < text.length || out.length === 0) out.push({ text: text.slice(last), mention: false });
  return out;
}

/** The known mention that ends exactly at the caret, for one-step Backspace. */
export function mentionEndingAt(
  text: string,
  caret: number,
  names: string[],
): { start: number; end: number } | null {
  let pos = 0;
  for (const seg of splitMentions(text, names)) {
    const end = pos + seg.text.length;
    if (seg.mention && end === caret) return { start: pos, end };
    pos = end;
  }
  return null;
}
