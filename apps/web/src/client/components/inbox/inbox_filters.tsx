'use client';

import { SNSelect, SNTooltip } from '@sineva/ui';
import { cn } from '@/client/components/ui/cn';
import { useTranslations } from '@/i18n/provider';
import type { InboxKindView } from '@/shared/inbox_view';
import type { ShellSpecialistView } from '@/shared/shell_view';
import { InboxAvatar } from './inbox_avatar';
import type { InboxView } from './inbox_model';

export interface InboxFilterValues {
  agent_slug?: string;
  kind?: InboxKindView;
  source_type?: 'chat' | 'room' | 'system';
  q?: string;
}

const chip =
  'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-pill px-3 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-focus) pointer-coarse:h-11';

/**
 * Filter chips: a specialist is a face (Sino in that specialist's pose), a kind
 * is a word. Each chip is a toggle: press it to filter, press it again to
 * clear. The state lives in the address, so the screen only reports a change.
 */
export function InboxFilters({
  view,
  specialists,
  values,
  onChange,
}: {
  view: InboxView;
  specialists: readonly ShellSpecialistView[];
  values: InboxFilterValues;
  onChange: (next: InboxFilterValues) => void;
}) {
  const t = useTranslations('inbox_ui');
  // Updates holds only results, so a kind filter there could only ever empty the list.
  const showKinds = view !== 'updates';

  return (
    <div className="space-y-2">
      <div role="group" aria-label={t('filter_specialist')} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 py-1">
        {specialists.map((specialist) => {
          const pressed = values.agent_slug === specialist.agent_slug;
          return (
            <SNTooltip key={specialist.agent_slug} label={specialist.display_name}>
              <button
                type="button"
                aria-label={specialist.display_name}
                aria-pressed={pressed}
                onClick={() => onChange({ ...values, agent_slug: pressed ? undefined : specialist.agent_slug })}
                className={cn(
                  'relative shrink-0 cursor-pointer rounded-sm transition-[box-shadow,opacity] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-focus)',
                  pressed
                    ? 'ring-2 ring-action-primary ring-offset-2 ring-offset-surface'
                    : values.agent_slug
                      ? 'opacity-55 hover:opacity-100'
                      : 'hover:opacity-80',
                )}
              >
                <InboxAvatar slug={specialist.agent_slug} size={32} />
              </button>
            </SNTooltip>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {showKinds ? (
          <div role="group" aria-label={t('filter_kind')} className="flex gap-1.5">
            {(
              [
                ['approval', t('chip_drafts')],
                ['input_request', t('chip_questions')],
              ] as const
            ).map(([kind, label]) => {
              const pressed = values.kind === kind;
              return (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => onChange({ ...values, kind: pressed ? undefined : kind })}
                  className={cn(
                    chip,
                    pressed
                      ? 'bg-surface-tint text-text-brand ring-1 ring-inset ring-action-primary'
                      : 'bg-canvas-alt text-text-secondary hover:bg-(--state-hover) hover:text-text',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        ) : null}
        <div className="ms-auto min-w-36">
          <SNSelect
            aria-label={t('filter_source')}
            value={values.source_type ?? ''}
            onValueChange={(next) =>
              onChange({ ...values, source_type: next === '' ? undefined : (next as NonNullable<InboxFilterValues['source_type']>) })
            }
            options={[
              { value: '', label: t('source_any') },
              { value: 'chat', label: t('from_chat') },
              { value: 'room', label: t('from_room') },
              { value: 'system', label: t('from_system') },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
