'use client';

import * as React from 'react';
import { formatDate, formatRelativeTime } from '@sineva/ui/format';
import { useLocale, useTranslations } from '@/i18n/provider';
import type { InboxItemView, InboxKindView } from '@/shared/inbox_view';
import type { ShellSpecialistView } from '@/shared/shell_view';
import { expiryHint } from './inbox_model';

// A draft kind is a slug from the producer. Only the ones listed here get a
// word in the sentence; anything else reads as "draft", never as the raw slug.
const DRAFT_KINDS = {
  post: 'draft_kinds.post',
  reply: 'draft_kinds.reply',
  email: 'draft_kinds.email',
  message: 'draft_kinds.message',
  caption: 'draft_kinds.caption',
  report: 'draft_kinds.report',
  document: 'draft_kinds.document',
  proposal: 'draft_kinds.proposal',
} as const satisfies Record<string, string>;

// The sentence of a result is a platform key like the other two; naming it here
// keeps the catalog entry tied to the code that reads it.
const RESULT_SENTENCE = 'inbox.sentence.result';

function isDraftKind(value: string): value is keyof typeof DRAFT_KINDS {
  return Object.hasOwn(DRAFT_KINDS, value);
}

export interface InboxText {
  /** Specialist display name, or "Sino" for the team. */
  nameOf(slug: string | null | undefined): string;
  /** The noun for a draft kind slug ("post"), or "draft" for one we have no word for. */
  draftKind(slug: string): string;
  /** The plain "what will happen" sentence of an item. */
  sentence(item: InboxItemView): string;
  kindLabel(kind: InboxKindView): string;
  /** "5 minutes ago". */
  ago(iso: string): string;
  /** The full date and time, for a tooltip. */
  exact(iso: string): string;
  /** "Expires in 2 h", or null while there is plenty of time. */
  expiry(expiresAt: string | null): string | null;
  now: Date;
}

/**
 * Everything the Inbox says about an item, so a row, the detail and the tests
 * read one set of words. Specialist names come from the roster the page
 * already has; a slug it does not know reads as Sino rather than as the slug.
 */
export function useInboxText(specialists: readonly ShellSpecialistView[], now: Date): InboxText {
  const t = useTranslations('inbox_ui');
  const root = useTranslations('');
  const locale = useLocale();

  return React.useMemo<InboxText>(() => {
    const names = new Map(specialists.map((s) => [s.agent_slug, s.display_name]));
    const nameOf = (slug: string | null | undefined) => (slug ? names.get(slug) : undefined) ?? t('team_name');

    const draftKind = (slug: string) => (isDraftKind(slug) ? t(DRAFT_KINDS[slug]) : t('draft_kinds.other'));

    return {
      nameOf,
      draftKind,
      sentence(item) {
        const params = item.summary.params;
        const slug = typeof params.specialist_slug === 'string' ? params.specialist_slug : item.agent_slug;
        const name = nameOf(slug);
        const draftKindSlug = typeof params.draft_kind === 'string' ? params.draft_kind : '';
        const kind = draftKind(draftKindSlug);
        const key = item.kind === 'result' ? RESULT_SENTENCE : item.summary.key;
        return root.has(key) ? root(key, { name, kind }) : t('sentence_fallback', { name });
      },
      kindLabel(kind) {
        if (kind === 'approval') return t('kind_approval');
        if (kind === 'input_request') return t('kind_question');
        return t('kind_result');
      },
      ago: (iso) => formatRelativeTime(iso, locale, now),
      exact: (iso) => formatDate(iso, locale, { dateStyle: 'medium', timeStyle: 'short' }),
      expiry(expiresAt) {
        const hint = expiryHint(expiresAt, now);
        if (!hint) return null;
        if (hint.unit === 'expired') return t('expired_short');
        return hint.unit === 'hours'
          ? t('expires_in_hours', { count: hint.count })
          : t('expires_in_minutes', { count: hint.count });
      },
      now,
    };
  }, [specialists, now, t, root, locale]);
}

/**
 * "Now" for relative times. It starts from the time the server rendered at, so
 * the first paint matches the server's HTML, then ticks once a minute so "just
 * now" does not stay "just now" all afternoon.
 */
export function useNow(serverNow: string): Date {
  const [now, setNow] = React.useState(() => new Date(serverNow));
  React.useEffect(() => {
    // No reset on mount: the server's time is at most a request old, and a
    // jump here would change every "5 minutes ago" right after hydration.
    const tick = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(tick);
  }, []);
  return now;
}
