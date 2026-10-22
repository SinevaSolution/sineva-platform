'use client';

import Link from 'next/link';
import * as React from 'react';
import { ConversationActions } from '@/client/components/conversation/conversation_actions';
import { InlineTitleEdit } from '@/client/components/conversation/inline_title_edit';
import { useConversationActions } from '@/client/components/conversation/use_conversation_actions';
import { chatMarker } from '@/client/components/shell/nav_model';
import { PresetEmptyState } from '@/client/components/ui/empty_state';
import { SNSinoFigure } from '@/client/components/ui/sn_sino_figure';
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
  const tConversation = useTranslations('conversation');
  const locale = useLocale();
  const version = useAppSelector((s) => s.ui.chats_version);
  const [items, setItems] = React.useState<ConversationView[] | null | 'error'>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const actions = useConversationActions({ workspaceId, workspaceSlug });
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
      <PresetEmptyState
        preset="home_recent"
        actionHref={`/w/${workspaceSlug}/new`}
        className="rounded-md border border-dashed border-border-strong p-6"
      />
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
        const title = c.title?.trim() || tShell('recent.untitled');
        return (
          <li key={c.id} className="group relative">
            {editingId === c.id ? (
              <div className="flex items-center gap-3 rounded-md border border-border-strong bg-(--state-hover) p-2 pe-3">
                <SNSinoFigure pose={marker.pose} size={40} />
                <span className="min-w-0 flex-1">
                  <InlineTitleEdit
                    value={c.title}
                    label={tConversation('rename_label')}
                    className="h-7 w-full text-sm font-medium"
                    onCancel={() => setEditingId(null)}
                    onSave={(next) => {
                      setEditingId(null);
                      void actions.rename(c.id, next, {
                        previous: c.title,
                        apply: (value) =>
                          setItems((prev) =>
                            Array.isArray(prev)
                              ? prev.map((x) => (x.id === c.id ? { ...x, title: value } : x))
                              : prev,
                          ),
                      });
                    }}
                  />
                  <span className="mt-0.5 block text-xs text-text-tertiary">
                    {withLabel} · {formatRelativeTime(c.last_message_at ?? c.created_at, locale)}
                  </span>
                </span>
              </div>
            ) : (
              <>
                {/* The menu button is a sibling of the link, never inside it. */}
                <Link
                  href={`/w/${workspaceSlug}/chat/${c.id}`}
                  className="flex items-center gap-3 rounded-md border border-border p-2 pe-11 transition-colors hover:border-border-strong hover:bg-(--state-hover)"
                >
                  <SNSinoFigure pose={marker.pose} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-text">{title}</span>
                    <span className="text-xs text-text-tertiary">
                      {withLabel} · {formatRelativeTime(c.last_message_at ?? c.created_at, locale)}
                    </span>
                  </span>
                </Link>
                <div className="absolute inset-y-0 end-2 flex items-center">
                  <ConversationActions
                    title={title}
                    triggerClassName="size-7 opacity-0 focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
                    onRename={() => setEditingId(c.id)}
                    onDelete={async () => {
                      const ok = await actions.remove(c.id);
                      if (ok) {
                        setItems((prev) =>
                          Array.isArray(prev) ? prev.filter((x) => x.id !== c.id) : prev,
                        );
                      }
                      return ok;
                    }}
                  />
                </div>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
