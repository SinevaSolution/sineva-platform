'use client';

import * as React from 'react';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { SNTooltip } from '@sineva/ui';
import { useTranslations } from '@/i18n/provider';
import type { LibraryKnowledgeView } from '@/shared/library_view';

/**
 * "Knows N documents": how much of the Library a companion can use, linking
 * to the Library filtered to exactly those files. For a specialist the filter
 * is `used_by` (Everyone's files plus the ones chosen for it); for Sino in team
 * chats it is the files marked Everyone, which is all Sino reads there. The
 * frosted look matches the other chips that sit on a Room's photo.
 */
export function LibraryKnowsChip({
  workspaceSlug,
  knowledge,
  agentSlug,
  name,
}: {
  workspaceSlug: string;
  knowledge: LibraryKnowledgeView;
  /** The specialist, or null for Sino in team chats. */
  agentSlug: string | null;
  name: string;
}) {
  const t = useTranslations('library_ui');
  // A specialist this member may not use has no entry; showing nothing beats showing a made-up zero.
  const count = agentSlug ? knowledge.specialists[agentSlug] : knowledge.everyone;
  if (count === undefined) return null;
  const href = agentSlug
    ? `/w/${workspaceSlug}/library?used_by=${encodeURIComponent(agentSlug)}`
    : `/w/${workspaceSlug}/library?scope_type=workspace`;
  return (
    <SNTooltip label={agentSlug ? t('knows.tip_specialist', { name }) : t('knows.tip_team')} side="bottom">
      <Link
        href={href}
        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-text-inverse/12 px-3 text-xs font-medium text-text-inverse ring-1 ring-text-inverse/20 backdrop-blur-md transition-[background-color,transform] duration-150 hover:bg-text-inverse/20 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none"
      >
        <BookOpen aria-hidden="true" className="size-3.5" />
        {t('knows.chip', { count })}
      </Link>
    </SNTooltip>
  );
}
