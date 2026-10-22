import type { MentionEntity } from '../entities/message';
import { findSpecialistByHandle } from './specialist_catalog';

export interface ParsedMentionsResult {
  leadingSpecialistSlug?: string;
  mentions: MentionEntity[];
}

const MENTION_REGEX = /@([A-Za-z0-9_-]+)/g;

/**
 * Re-parses message text server-side to extract valid mentions of Sineva specialists (FR-HUB-08).
 * Forged or invalid mentions sent by clients are discarded.
 */
export function parseMentions(text: string): ParsedMentionsResult {
  const trimmed = text.trim();
  const mentions: MentionEntity[] = [];
  const seenSlugs = new Set<string>();

  let match: RegExpExecArray | null;
  const regex = new RegExp(MENTION_REGEX.source, 'g');

  let firstMatchHandle: string | undefined;
  let firstMatchIndex = -1;

  while ((match = regex.exec(trimmed)) !== null) {
    const rawHandle = match[0];
    if (firstMatchIndex === -1) {
      firstMatchIndex = match.index;
      firstMatchHandle = rawHandle;
    }

    const specialist = findSpecialistByHandle(rawHandle);
    if (specialist && !seenSlugs.has(specialist.slug)) {
      seenSlugs.add(specialist.slug);
      mentions.push({
        agent_slug: specialist.slug,
        display_name: specialist.displayName,
        handle: specialist.handle,
      });
    }
  }

  // A leading mention must start at the very beginning of the message (index 0)
  let leadingSpecialistSlug: string | undefined;
  if (firstMatchIndex === 0 && firstMatchHandle) {
    const leadingSpecialist = findSpecialistByHandle(firstMatchHandle);
    if (leadingSpecialist) {
      leadingSpecialistSlug = leadingSpecialist.slug;
    }
  }

  return {
    leadingSpecialistSlug,
    mentions,
  };
}
