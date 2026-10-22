import { findSpecialistByHandle } from './specialist_catalog';

export interface MentionSpan {
  agent_slug: string;
  start: number;
  end: number;
}

const MENTION_REGEX = /@([A-Za-z0-9_-]+)/g;

/**
 * Character offsets of every `@Specialist` mention in the text, as the chat
 * contract's `mentions[]` wants them (`end` exclusive). Offsets are computed
 * from the stored text here, never taken from the browser (FR-HUB-08).
 */
export function findMentionSpans(text: string): MentionSpan[] {
  const spans: MentionSpan[] = [];
  const regex = new RegExp(MENTION_REGEX.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const specialist = findSpecialistByHandle(match[0]);
    if (specialist) {
      spans.push({
        agent_slug: specialist.slug,
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }
  return spans;
}
