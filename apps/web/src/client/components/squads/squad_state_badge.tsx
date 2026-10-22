'use client';

import { SNBadge } from '@sineva/ui';
import { useTranslations } from '@/i18n/provider';
import type { SquadState } from './squad_model';

/**
 * The state of a squad as a badge: a word and an icon, never a color alone.
 * A squad that is simply ready shows nothing, because "all fine" needs no label.
 */
export function SquadStateBadge({ state }: { state: SquadState }) {
  const t = useTranslations('squads_ui');
  if (state === 'ready') return null;
  if (state === 'archived') return <SNBadge tone="neutral">{t('status_archived')}</SNBadge>;
  if (state === 'no_access') return <SNBadge tone="warning">{t('status_no_access')}</SNBadge>;
  if (state === 'unchecked') return <SNBadge tone="neutral">{t('status_unchecked')}</SNBadge>;
  return <SNBadge tone="review">{t('status_attention')}</SNBadge>;
}
