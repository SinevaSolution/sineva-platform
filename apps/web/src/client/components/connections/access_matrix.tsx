'use client';

import * as React from 'react';
import { SNButton, SNSwitch, SNTooltip } from '@sineva/ui';
import { SNSpecialistTile } from '@/client/components/ui/sn_specialist_tile';
import { useTranslations } from '@/i18n/provider';
import type { GrantView, ProviderView } from '@/shared/connections_view';
import type { ShellSpecialistView } from '@/shared/shell_view';
import { accessMatrixRows, writeDisabledReason, type MatrixRow } from './connections_model';

/**
 * Rows are specialists, columns "Can read" and "Can make changes (asks you
 * first)". One DOM for every width: the column heads show from 640 px up, and
 * each switch carries its own visible label below that, so a phone gets a card
 * per specialist without a second copy of the markup.
 *
 * Turning "make changes" on is never applied here: it goes up through
 * `onToggle` so the screen can ask first. Everything else applies to the draft
 * the screen holds until Save.
 */
export function AccessMatrix({
  provider,
  specialists,
  grants,
  canGrant,
  onToggle,
}: {
  provider: ProviderView;
  specialists: ShellSpecialistView[];
  grants: GrantView[];
  /** The server lets this person change access (`can.grant`); otherwise every switch is read only. */
  canGrant: boolean;
  onToggle: (agentSlug: string, kind: 'read' | 'write', on: boolean) => void;
}) {
  const t = useTranslations('connections');
  const [othersOpen, setOthersOpen] = React.useState(false);
  const rows = accessMatrixRows({
    provider,
    grants,
    specialists: specialists.map((s) => s.agent_slug),
  });
  const declared = rows.filter((r) => r.declared);
  const others = rows.filter((r) => !r.declared);
  const nameOf = (slug: string) => specialists.find((s) => s.agent_slug === slug)?.display_name ?? slug;
  const showWrite = provider.write_supported;
  const columns = showWrite
    ? 'sm:grid-cols-[minmax(0,1fr)_9rem_15rem]'
    : 'sm:grid-cols-[minmax(0,1fr)_9rem]';

  const renderRow = (row: MatrixRow) => {
    const name = nameOf(row.agent_slug);
    const reason = writeDisabledReason(canGrant, { readOnlyByDesign: row.readOnlyByDesign });
    const canRead = row.level !== 'none';
    const canWrite = row.level === 'write';
    return (
      <li key={row.agent_slug} className={`grid items-center gap-x-4 gap-y-2 py-3 ${columns}`}>
        <div className="flex min-w-0 items-center gap-2.5">
          <SNSpecialistTile agentSlug={row.agent_slug} name={name} size="md" />
          <span className="min-w-0 truncate text-sm font-medium text-text">{name}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-text-secondary sm:sr-only">{t('access.can_read')}</span>
          {canGrant ? (
            <SNSwitch
              checked={canRead}
              aria-label={t('matrix.read_label', { name, app: provider.name })}
              onCheckedChange={(on) => onToggle(row.agent_slug, 'read', on)}
            />
          ) : (
            <SNTooltip label={t('matrix.view_only_tip')}>
              <span tabIndex={0} className="inline-flex rounded-xs focus-visible:outline-2 focus-visible:outline-focus">
                <SNSwitch
                  checked={canRead}
                  disabled
                  aria-label={t('matrix.read_label', { name, app: provider.name })}
                />
              </span>
            </SNTooltip>
          )}
        </div>
        {showWrite ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-text-secondary sm:sr-only">{t('access.can_change_short')}</span>
            {reason === 'read_only' ? (
              <span className="text-[13px] text-text-tertiary">{t('matrix.read_only_by_design')}</span>
            ) : reason === 'view_only' ? (
              <SNTooltip label={t('matrix.write_admin_only_tip')}>
                <span tabIndex={0} className="inline-flex rounded-xs focus-visible:outline-2 focus-visible:outline-focus">
                  <SNSwitch
                    checked={canWrite}
                    disabled
                    aria-label={t('matrix.write_label', { name, app: provider.name })}
                  />
                </span>
              </SNTooltip>
            ) : (
              <SNSwitch
                checked={canWrite}
                aria-label={t('matrix.write_label', { name, app: provider.name })}
                onCheckedChange={(on) => onToggle(row.agent_slug, 'write', on)}
              />
            )}
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <div>
      <div
        aria-hidden="true"
        className={`hidden gap-x-4 border-b border-border pb-2 text-[12px] font-medium text-text-tertiary sm:grid ${columns}`}
      >
        <span>{t('matrix.specialist')}</span>
        <span>{t('access.can_read')}</span>
        {showWrite ? <span>{t('access.can_change')}</span> : null}
      </div>
      <ul className="divide-y divide-border">{declared.map(renderRow)}</ul>
      {others.length > 0 ? (
        <div className="border-t border-border pt-2">
          <SNButton
            variant="ghost"
            size="sm"
            aria-expanded={othersOpen}
            aria-controls="matrix-others"
            onClick={() => setOthersOpen((v) => !v)}
          >
            {t('matrix.others', { count: others.length })}
          </SNButton>
          {othersOpen ? (
            <ul id="matrix-others" className="divide-y divide-border">
              {others.map(renderRow)}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
