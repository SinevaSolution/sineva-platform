'use client';

import Link from 'next/link';
import * as React from 'react';
import { chatMarker } from '@/client/components/shell/nav_model';
import { SinoFigure } from '@/client/components/ui/sino_figure';
import { apiRequest } from '@/client/lib/api';
import { useAppSelector } from '@/client/store/hooks';
import type { ConversationView } from '@/shared/chat_view';
import type { ShellSpecialistView } from '@/shared/shell_view';

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function ago(iso: string): string {
  const mins = Math.round((Date.parse(iso) - Date.now()) / 60000);
  if (Math.abs(mins) < 60) return rtf.format(mins, 'minute');
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  return rtf.format(Math.round(hours / 24), 'day');
}

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
      <div aria-busy="true" aria-label="Loading chats" className="space-y-1.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-hover" />
        ))}
      </div>
    );
  }
  if (items === 'error') {
    return <p className="text-sm text-fg-tertiary">Couldn&apos;t load your chats. Refresh to try again.</p>;
  }
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-line-strong p-4">
        <SinoFigure pose="wave" size={44} />
        <p className="text-sm text-fg-secondary">
          No chats yet. Pick someone from your team above, or{' '}
          <Link href={`/w/${workspaceSlug}/new`} className="font-medium text-fg-brand hover:underline">
            ask Sino
          </Link>
          .
        </p>
      </div>
    );
  }
  return (
    <ul className="space-y-1.5">
      {items.map((c) => {
        const marker = chatMarker(c, names);
        return (
          <li key={c.id}>
            <Link
              href={`/w/${workspaceSlug}/chat/${c.id}`}
              className="flex items-center gap-3 rounded-xl border border-line p-2 pr-3 transition-colors hover:border-line-strong hover:bg-hover"
            >
              <SinoFigure pose={marker.pose} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg">{c.title?.trim() || 'New chat'}</span>
                <span className="text-xs text-fg-tertiary">
                  {marker.label === 'Team' ? 'Team chat' : `With ${marker.label}`} · {ago(c.last_message_at ?? c.created_at)}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
