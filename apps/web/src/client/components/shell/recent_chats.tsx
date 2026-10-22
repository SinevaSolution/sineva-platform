'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { apiRequest } from '@/client/lib/api';
import { useAppSelector } from '@/client/store/hooks';
import { useTranslations } from '@/i18n/provider';
import { ConversationActions } from '@/client/components/conversation/conversation_actions';
import { InlineTitleEdit } from '@/client/components/conversation/inline_title_edit';
import { useConversationActions } from '@/client/components/conversation/use_conversation_actions';
import { cn } from '@/client/components/ui/cn';
import { SNSinoFigure } from '@/client/components/ui/sn_sino_figure';
import type { ConversationView } from '@/shared/chat_view';
import { chatMarker } from './nav_model';

interface ConversationPage {
  items: ConversationView[];
  next_cursor: string | null;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; items: ConversationView[] };

const MAX_ITEMS = 12;

/**
 * "Recent chats" list in the sidebar, newest first. Each row says who the
 * chat is with: "Team" for a chat with Sino (specialists join by @mention),
 * or the specialist's name for a private chat, with their pose as avatar.
 */
export function RecentChats({
  workspaceId,
  workspaceSlug,
  specialistNames,
  onNavigate,
}: {
  workspaceId: string;
  workspaceSlug: string;
  specialistNames: Record<string, string>;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const t = useTranslations('shell');
  const tSpecialists = useTranslations('specialists');
  const tConversation = useTranslations('conversation');
  const version = useAppSelector((s) => s.ui.chats_version);
  const [state, setState] = React.useState<LoadState>({ status: 'loading' });
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const actions = useConversationActions({ workspaceId, workspaceSlug });

  const setTitle = React.useCallback((id: string, title: string | null) => {
    setState((prev) =>
      prev.status !== 'ready'
        ? prev
        : { ...prev, items: prev.items.map((c) => (c.id === id ? { ...c, title } : c)) },
    );
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    apiRequest<ConversationPage>(`/api/v1/workspaces/${workspaceId}/conversations`)
      .then((page) => {
        if (cancelled) return;
        const items = [...page.items]
          .sort((a, b) => (b.last_message_at ?? b.created_at).localeCompare(a.last_message_at ?? a.created_at))
          .slice(0, MAX_ITEMS);
        setState({ status: 'ready', items });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, version]);

  if (state.status === 'loading') {
    return (
      <div aria-hidden="true" className="space-y-1 px-2 py-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-3.5 w-3/4 animate-pulse rounded-xs bg-(--state-hover)" />
        ))}
      </div>
    );
  }
  if (state.status === 'error') {
    return <p className="px-2 py-1 text-xs text-text-tertiary">{t('recent.load_failed')}</p>;
  }
  if (state.items.length === 0) {
    return <p className="px-2 py-1 text-xs text-text-tertiary">{t('recent.empty')}</p>;
  }

  return (
    <ul className="space-y-px">
      {state.items.map((c) => {
        const href = `/w/${workspaceSlug}/chat/${c.id}`;
        const active = pathname === href;
        const marker = chatMarker(c, specialistNames);
        const markerLabel =
          marker.kind === 'team' ? tSpecialists('marker.team') : (marker.name ?? tSpecialists('marker.specialist'));
        const title = c.title?.trim() || t('recent.untitled');
        if (editingId === c.id) {
          return (
            <li key={c.id}>
              <div className="flex h-8 items-center gap-1.5 rounded-sm bg-(--state-hover) ps-1 pe-1.5 text-[13px]">
                <SNSinoFigure pose={marker.pose} size={22} className="-my-1" />
                <InlineTitleEdit
                  value={c.title}
                  label={tConversation('rename_label')}
                  className="h-6 flex-1 text-[13px]"
                  onCancel={() => setEditingId(null)}
                  onSave={(next) => {
                    setEditingId(null);
                    void actions.rename(c.id, next, {
                      previous: c.title,
                      apply: (value) => setTitle(c.id, value),
                    });
                  }}
                />
              </div>
            </li>
          );
        }
        return (
          // The menu button is a sibling of the link, never inside it (a
          // button in an anchor is invalid and breaks keyboard use).
          <li key={c.id} className="group relative">
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-sm ps-1 pe-2 text-[13px] text-text-secondary hover:bg-(--state-hover) hover:text-text',
                active && 'bg-surface-tint font-medium text-text',
              )}
            >
              <SNSinoFigure pose={marker.pose} size={22} className="-my-1" />
              <span className="min-w-0 flex-1 truncate">{title}</span>
              {/* The badge gives its slot to the menu button while it shows. */}
              <span
                className={cn(
                  'shrink-0 rounded-full px-1.5 text-[10px] font-medium leading-4 group-focus-within:hidden group-hover:hidden group-has-[[data-state=open]]:hidden [@media(hover:none)]:hidden',
                  marker.kind === 'team'
                    ? 'bg-[color-mix(in_oklab,var(--color-focus)_16%,transparent)] text-text-brand'
                    : 'bg-(--state-hover) text-text-tertiary',
                )}
              >
                <span className="sr-only">{t('recent.with')} </span>
                {markerLabel}
              </span>
              <span aria-hidden="true" className="hidden size-6 shrink-0 group-focus-within:block group-hover:block group-has-[[data-state=open]]:block [@media(hover:none)]:block" />
            </Link>
            <div className="absolute inset-y-0 end-1 flex items-center">
              <ConversationActions
                title={title}
                side="right"
                align="start"
                triggerClassName="opacity-0 focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
                onRename={() => setEditingId(c.id)}
                onDelete={async () => {
                  const ok = await actions.remove(c.id);
                  if (ok) {
                    setState((prev) =>
                      prev.status !== 'ready'
                        ? prev
                        : { ...prev, items: prev.items.filter((x) => x.id !== c.id) },
                    );
                  }
                  return ok;
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
