'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';
import type { ComposerHandle } from '@/client/components/chat/composer';
import { StartChat } from '@/client/components/chat/start_chat';
import { cn } from '@/client/components/ui/cn';
import { SinoFigure } from '@/client/components/ui/sino_figure';
import { specialistPose } from '@/client/components/ui/specialist_accent';
import { Tooltip } from '@/client/components/ui/tooltip';
import { useTranslations } from '@/i18n/provider';
import type { ShellSpecialistView } from '@/shared/shell_view';
import { teamStarterKeys, type RoomMood } from './room_model';
import { RoomBubble, RoomStage } from './room_stage';

/**
 * New chat. The cast sits on top: "Team" (Sino, specialists join by
 * @mention) or one specialist for a private chat. Choosing one swaps the
 * room, the living Sino and the starter prompts in place, and keeps the
 * choice in the URL (?with=) so it survives reloads and can be linked.
 */
export function NewChatView({
  workspaceId,
  workspaceSlug,
  firstName,
  specialists,
  initialWith,
  initialPrompt,
}: {
  /** Prefills the box (Home "Ideas for today"); never sent automatically. */
  initialPrompt?: string | null;
  workspaceId: string;
  workspaceSlug: string;
  firstName: string;
  specialists: ShellSpecialistView[];
  initialWith: string | null;
}) {
  const router = useRouter();
  const t = useTranslations('room');
  const tSpecialists = useTranslations('specialists');
  const [withSlug, setWithSlug] = React.useState<string | null>(initialWith);
  const [mood, setMood] = React.useState<RoomMood>('idle');
  const composer = React.useRef<ComposerHandle>(null);
  const current = specialists.find((s) => s.agent_slug === withSlug) ?? null;
  const name = current?.display_name ?? 'Sino';
  // A specialist's prompts come from the manifest, already in the page language;
  // the team chat's are catalog messages.
  const starterTexts = current ? [...current.starter_prompts] : teamStarterKeys().map((key) => t(key));

  React.useEffect(() => {
    if (initialPrompt) composer.current?.fill(initialPrompt);
    // Once, on arrival: later picks must not bring the idea back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function choose(slug: string | null) {
    setWithSlug(slug);
    setMood('idle');
    router.replace(slug ? `/w/${workspaceSlug}/new?with=${slug}` : `/w/${workspaceSlug}/new`, { scroll: false });
  }

  const picker = (
    <div className="px-4 pt-4 sm:px-6">
      <div role="radiogroup" aria-label={t('picker_label')} className="flex gap-1.5 overflow-x-auto pb-1">
        <CastChip
          checked={withSlug === null}
          onSelect={() => choose(null)}
          pose="wave"
          label={tSpecialists('marker.team')}
          hint={t('team_hint')}
        />
        {specialists.map((s) => (
          <CastChip
            key={s.agent_slug}
            checked={withSlug === s.agent_slug}
            onSelect={() => choose(s.agent_slug)}
            pose={specialistPose(s.agent_slug)}
            label={s.display_name}
            hint={t('specialist_hint', { name: s.display_name, role: s.role_title })}
          />
        ))}
      </div>
    </div>
  );

  const footer = (
    <div className="px-4 pb-4 sm:px-6">
      <StartChat
        // Remount per companion so a half-typed @mention menu never carries over.
        key={withSlug ?? 'team'}
        ref={composer}
        workspaceId={workspaceId}
        workspaceSlug={workspaceSlug}
        agentSlug={withSlug ?? undefined}
        specialists={withSlug ? undefined : specialists}
        onPendingChange={(p) => setMood(p ? 'working' : 'idle')}
        placeholder={withSlug ? t('placeholder_specialist', { name }) : t('placeholder_team')}
      />
      <p className="mt-2 text-center text-[11px] text-white/60">
        {withSlug ? t('footer_specialist', { name }) : t('footer_team')}
      </p>
    </div>
  );

  return (
    <RoomStage slug={withSlug} mood={mood} label={withSlug ? name : t('stage_team')} header={picker} footer={footer}>
      <div key={withSlug ?? 'team'} className="flex min-h-full flex-col justify-end gap-3 px-4 pb-4 pt-8 sm:px-6">
        <div className="anim-rise flex items-end gap-2">
          <SinoFigure pose={specialistPose(withSlug ?? 'sino')} size={36} className="md:hidden" />
          <RoomBubble from="companion">
            <span className="block text-xs font-semibold text-fg-brand">{name}</span>
            {t('hello', { name: firstName })}{' '}
            {current ? t('intro_specialist', { role: current.role_title }) : t('intro_team')}
          </RoomBubble>
        </div>
        <ul className="flex flex-wrap gap-2" aria-label={t('starters_label')}>
          {starterTexts.map((text, i) => {
            return (
              <li key={text} className="anim-rise" style={{ '--d': `${120 + i * 70}ms` } as React.CSSProperties}>
                <button
                  type="button"
                  onClick={() => composer.current?.fill(text)}
                  className="rounded-full bg-white/12 px-3 py-1.5 text-left text-[13px] text-white ring-1 ring-white/20 backdrop-blur-md transition-[background-color,transform] duration-150 hover:bg-white/20 active:scale-[0.98]"
                >
                  {text}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </RoomStage>
  );
}

function CastChip({
  checked,
  onSelect,
  pose,
  label,
  hint,
}: {
  checked: boolean;
  onSelect: () => void;
  pose: Parameters<typeof SinoFigure>[0]['pose'];
  label: string;
  hint: string;
}) {
  return (
    <Tooltip label={hint} side="bottom">
      <button
        type="button"
        role="radio"
        aria-checked={checked}
        onClick={onSelect}
        className={cn(
          'group flex h-11 shrink-0 items-center gap-1.5 rounded-full pl-0.5 pr-3.5 text-[13px] font-medium ring-1 backdrop-blur-md transition-[background-color,color,box-shadow] duration-200',
          checked
            ? 'bg-[color-mix(in_oklab,var(--color-surface)_94%,transparent)] text-fg ring-white/60'
            : 'bg-white/10 text-white/85 ring-white/15 hover:bg-white/20 hover:text-white',
        )}
      >
        <SinoFigure
          pose={pose}
          size={40}
          className="transition-transform duration-300 ease-[var(--ease-out-quint)] group-hover:-translate-y-0.5"
        />
        {label}
      </button>
    </Tooltip>
  );
}
