'use client';

import * as React from 'react';
import { Users } from 'lucide-react';
import { SNBadge, SNSwitch } from '@sineva/ui';
import { cn } from '@/client/components/ui/cn';
import { SNSpecialistTile } from '@/client/components/ui/sn_specialist_tile';
import { useTranslations } from '@/i18n/provider';
import type { ShellSpecialistView } from '@/shared/shell_view';
import type { AccessChoice } from './library_model';
import { CHIP_BASE } from './library_chip';
import { useLibrarySquads } from './library_squads';

/**
 * "Who can use this": an Everyone switch, then one toggle per specialist.
 * With Everyone on, the specialist toggles show as included and cannot be
 * changed, which says out loud what Everyone means. The workspace's squads are
 * toggles like specialists (ADR-0043). Workflows are listed as a disabled "Soon"
 * option so people see where access is going; the API rejects it until then.
 */
export function LibraryAccessPicker({
  value,
  onChange,
  specialists,
  disabled = false,
  invalid = false,
}: {
  value: AccessChoice;
  onChange: (next: AccessChoice) => void;
  specialists: readonly ShellSpecialistView[];
  disabled?: boolean;
  /** Nothing chosen: shows the message and marks the group. */
  invalid?: boolean;
}) {
  const t = useTranslations('library_ui');
  const squads = useLibrarySquads();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const errorId = `${uid}-error`;

  function toggle(slug: string) {
    const has = value.specialists.includes(slug);
    onChange({
      ...value,
      everyone: false,
      specialists: has ? value.specialists.filter((entry) => entry !== slug) : [...value.specialists, slug],
    });
  }

  function toggleSquad(id: string) {
    const has = value.squads.includes(id);
    onChange({
      ...value,
      everyone: false,
      squads: has ? value.squads.filter((entry) => entry !== id) : [...value.squads, id],
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4 rounded-md bg-canvas-alt p-3">
        <div className="min-w-0">
          <label htmlFor={`${uid}-everyone`} className="block text-sm font-medium text-text">
            {t('access.everyone')}
          </label>
          <p id={hintId} className="mt-0.5 text-xs text-text-secondary">
            {t('access.everyone_hint')}
          </p>
        </div>
        <SNSwitch
          id={`${uid}-everyone`}
          checked={value.everyone}
          disabled={disabled}
          aria-describedby={hintId}
          onCheckedChange={(checked) =>
            onChange({ everyone: checked, specialists: checked ? [] : value.specialists, squads: checked ? [] : value.squads })
          }
        />
      </div>
      <ul
        aria-label={t('access.specialists')}
        aria-describedby={invalid ? errorId : undefined}
        className="flex flex-wrap gap-2"
      >
        {specialists.map((specialist) => {
          const included = value.everyone || value.specialists.includes(specialist.agent_slug);
          return (
            <li key={specialist.agent_slug}>
              <button
                type="button"
                aria-pressed={included}
                disabled={disabled || value.everyone}
                onClick={() => toggle(specialist.agent_slug)}
                className={cn(
                  CHIP_BASE,
                  'gap-2 ps-1.5',
                  included
                    ? 'border-transparent bg-surface-tint text-text-brand'
                    : 'border-border-strong bg-surface text-text-secondary hover:bg-(--state-hover) hover:text-text',
                )}
              >
                <SNSpecialistTile agentSlug={specialist.agent_slug} name={specialist.display_name} size="sm" className="rounded-full" />
                {specialist.display_name}
              </button>
            </li>
          );
        })}
        {squads.map((squad) => {
          const included = value.everyone || value.squads.includes(squad.id);
          return (
            <li key={squad.id}>
              <button
                type="button"
                aria-pressed={included}
                disabled={disabled || value.everyone}
                onClick={() => toggleSquad(squad.id)}
                className={cn(
                  CHIP_BASE,
                  'gap-2',
                  included
                    ? 'border-transparent bg-surface-tint text-text-brand'
                    : 'border-border-strong bg-surface text-text-secondary hover:bg-(--state-hover) hover:text-text',
                )}
              >
                <Users aria-hidden="true" className="size-4" />
                {squad.name}
              </button>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            disabled
            aria-disabled="true"
            className={cn(CHIP_BASE, 'gap-2 border-dashed border-border-strong bg-surface text-text-tertiary')}
          >
            {t('access.workflows')}
            <SNBadge tone="neutral">{t('soon')}</SNBadge>
          </button>
        </li>
      </ul>
      {invalid ? (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {t('access.none_error')}
        </p>
      ) : null}
    </div>
  );
}
