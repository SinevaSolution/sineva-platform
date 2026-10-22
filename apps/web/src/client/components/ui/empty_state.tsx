'use client';

import Link from 'next/link';
import * as React from 'react';
import { SNButton, SNEmptyState } from '@sineva/ui';
import { useTranslations } from '@/i18n/provider';
import { EMPTY_STATES, type EmptyPreset, type EmptyStateName } from './empty_states';

export interface PresetEmptyStateProps {
  preset: EmptyStateName;
  /** Fills `{placeholders}` in the title and sentence. */
  values?: Record<string, string>;
  /**
   * Replaces the preset sentence when the screen holds the real text, such as
   * a specific error or a feature's own blurb.
   */
  description?: string;
  /**
   * Where the preset's call to action goes. Give a link or a handler, never
   * both. Without either, a preset that has an action shows no button, so a
   * place that already has its own button next to the list does not repeat it.
   */
  actionHref?: string;
  onAction?: () => void;
  /** A custom action node, for the rare place that needs more than one button. */
  action?: React.ReactNode;
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  className?: string;
}

/**
 * The one way a screen renders an empty state: look the place up in the
 * registry, read its copy from the `empty` namespace and hand it to
 * `SNEmptyState`.
 */
export function PresetEmptyState({
  preset,
  values,
  description,
  actionHref,
  onAction,
  action,
  headingLevel,
  className,
}: PresetEmptyStateProps) {
  const t = useTranslations('empty');
  // Widened on purpose: `as const` narrows each entry to its own literal shape,
  // and the optional fields are absent on some.
  const entry: EmptyPreset = EMPTY_STATES[preset];

  let actionNode: React.ReactNode = action;
  if (!actionNode && entry.action) {
    if (actionHref) {
      actionNode = (
        <SNButton asChild variant="primary" size="sm">
          <Link href={actionHref}>{t(entry.action, values)}</Link>
        </SNButton>
      );
    } else if (onAction) {
      actionNode = (
        <SNButton variant="primary" size="sm" onClick={onAction}>
          {t(entry.action, values)}
        </SNButton>
      );
    }
  }

  return (
    <SNEmptyState
      icon={entry.icon}
      pose={entry.pose}
      size={entry.size}
      title={t(entry.title, values)}
      description={description ?? t(entry.description, values)}
      action={actionNode}
      headingLevel={headingLevel ?? (entry.size === 'sm' ? 3 : 2)}
      className={className}
    />
  );
}
