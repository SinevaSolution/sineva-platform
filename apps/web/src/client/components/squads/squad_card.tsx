'use client';

import { MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import {
  SNCard,
  SNDropdownMenu,
  SNDropdownMenuContent,
  SNDropdownMenuItem,
  SNDropdownMenuTrigger,
  SNIconButton,
} from '@sineva/ui';
import { useTranslations } from '@/i18n/provider';
import type { ShellSpecialistView } from '@/shared/shell_view';
import type { SquadView } from '@/shared/squad_view';
import { SquadMemberTiles } from './squad_member_tiles';
import { squadState } from './squad_model';
import { SquadStateBadge } from './squad_state_badge';

/**
 * One squad on the list: name, goal in two lines, members as small tiles, who
 * leads and its state. The whole card opens the squad through a stretched
 * link; the menu sits above the link so the two never nest.
 */
export function SquadCard({
  squad,
  specialists,
  href,
  canManage,
  onEdit,
  onArchive,
  onRestore,
  onDelete,
}: {
  squad: SquadView;
  specialists: readonly ShellSpecialistView[];
  href: string;
  /** Owner or Admin: archive, restore and delete. */
  canManage: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations('squads_ui');
  const state = squadState(squad);
  const leadName =
    squad.lead_type === 'member' && squad.lead_agent_slug
      ? (specialists.find((s) => s.agent_slug === squad.lead_agent_slug)?.display_name ?? squad.lead_agent_slug)
      : null;
  const showMenu = squad.can_edit || canManage;

  return (
    <li className="relative">
      <SNCard elevated className="flex h-full flex-col gap-3 transition-colors hover:bg-(--state-hover)">
        <div className="flex items-start justify-between gap-2">
          <h2 className="min-w-0 text-[15px] font-semibold text-text">
            <Link
              href={href}
              className="rounded-xs after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {squad.name}
            </Link>
          </h2>
          {showMenu ? (
            <SNDropdownMenu>
              <SNDropdownMenuTrigger asChild>
                <SNIconButton label={t('actions_for', { name: squad.name })} className="relative z-10 -me-1 -mt-1">
                  <MoreHorizontal aria-hidden="true" />
                </SNIconButton>
              </SNDropdownMenuTrigger>
              <SNDropdownMenuContent align="end" className="w-44">
                {squad.can_edit && squad.status === 'active' ? (
                  <SNDropdownMenuItem onSelect={onEdit}>{t('edit')}</SNDropdownMenuItem>
                ) : null}
                {canManage && squad.status === 'active' ? (
                  <SNDropdownMenuItem onSelect={onArchive}>{t('archive')}</SNDropdownMenuItem>
                ) : null}
                {canManage && squad.status === 'archived' ? (
                  <SNDropdownMenuItem onSelect={onRestore}>{t('restore')}</SNDropdownMenuItem>
                ) : null}
                {canManage ? (
                  <SNDropdownMenuItem destructive onSelect={onDelete}>
                    {t('delete')}
                  </SNDropdownMenuItem>
                ) : null}
              </SNDropdownMenuContent>
            </SNDropdownMenu>
          ) : null}
        </div>
        <p className="line-clamp-2 text-sm text-text-secondary">{squad.goal}</p>
        <SquadMemberTiles
          slugs={squad.members.map((member) => member.agent_slug)}
          specialists={specialists}
          leadSlug={squad.lead_agent_slug}
          size="sm"
        />
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1 text-xs text-text-secondary">
          <span>{t('members_count', { count: squad.members.length })}</span>
          <span>{leadName ? t('led_by', { name: leadName }) : t('led_by_sino')}</span>
          <SquadStateBadge state={state} />
        </div>
      </SNCard>
    </li>
  );
}
