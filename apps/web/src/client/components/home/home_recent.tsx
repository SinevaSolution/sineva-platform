'use client';

import Link from 'next/link';
import * as React from 'react';
import { chatMarker } from '@/client/components/shell/nav_model';
import { SinoFigure } from '@/client/components/ui/sino_figure';
import { apiRequest } from '@/client/lib/api';
import { useAppSelector } from '@/client/store/hooks';
import { formatRelativeTime } from '@sineva/ui/format';
import { useLocale, useTranslations } from '@/i18n/provider';
import type { ConversationView } from '@/shared/chat_view';
import type { ShellSpecialistView } from '@/shared/shell_view';

/** The four latest chats as cards, each saying who it is with. */
export function HomeRecent({
  workspaceId,
  workspaceSlug,
  specialists,
}: {
  workspaceId: string;
  workspaceSlug: string;
  specialists: ShellSpecialistView[];
}) {
  const t = useTranslations('workspace');
  const tShell = useTranslations('shell');
  const tSpecialists = useTranslations('specialists');
  const locale = useLocale();
  const version = useAppSelector((s) => s.ui.chats_version);
  const [items, setItems] = React.useState<ConversationView[] | null | 'error'>(null);
  const names = React.useMemo(
    () => Object.fromEntries(specialists.map((s) => [s.agent_slug, s.display_name])),
    [specialists],
  );

  React.useEffect(() => {
    let cancelled = false;
    apiRequest<{ items: ConversationView[] }>(`/api/v1/workspaces/${workspaceId}/conversations`)
      .then((page) => {
        if (cancelled) return;
        const at = (c: ConversationView) => c.last_message_at ?? c.created_at;
        setItems([...page.items].sort((a, b) => at(b).localeCompare(at(a))).slice(0, 4));
      })
      .catch(() => !cancelled && setItems('error'));
    return () => {
      cancelled = true;
    };
  }, [workspaceId, version]);

  if (items === null) {
    return (
      <div aria-busy="true" aria-label={t('home.recent_loading')} className="space-y-1.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-md bg-(--state-hover)" />
        ))}
      </div>
    );
  }
  if (items === 'error') {
    return <p className="text-sm text-text-tertiary">{t('home.recent_failed')}</p>;
  }
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-dashed border-border-strong p-4">
        <SinoFigure pose="wave" size={44} />
        <p className="text-sm text-text-secondary">
          {t.rich('home.recent_empty', {
            link: (
              <Link href={`/w/${workspaceSlug}/new`} className="font-medium text-text-brand hover:underline">
                {t('home.recent_empty_link')}
              </Link>
            ),
          })}
        </p>
      </div>
    );
  }
  return (
    <ul className="space-y-1.5">
      {items.map((c) => {
        const marker = chatMarker(c, names);
        const withLabel =
          marker.kind === 'team'
            ? t('home.chat_team')
            : t('home.chat_with', { name: marker.name ?? tSpecialists('marker.specialist') });
        return (
          <li key={c.id}>
            <Link
              href={`/w/${workspaceSlug}/chat/${c.id}`}
              className="flex items-center gap-3 rounded-md border border-border p-2 pe-3 transition-colors hover:border-border-strong hover:bg-(--state-hover)"
            >
              <SinoFigure pose={marker.pose} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-text">{c.title?.trim() || tShell('recent.untitled')}</span>
                <span className="text-xs text-text-tertiary">
                  {withLabel} · {formatRelativeTime(c.last_message_at ?? c.created_at, locale)}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
