'use client';

import { MessageCircleQuestionMark, ShieldCheck, Sparkles, type LucideIcon } from 'lucide-react';
import { cn } from '@/client/components/ui/cn';
import { useTranslations } from '@/i18n/provider';
import type { InboxItemView, InboxKindView } from '@/shared/inbox_view';
import { InboxAvatar } from './inbox_avatar';
import { expiryHint } from './inbox_model';
import type { InboxText } from './inbox_text';

export const KIND_ICON: Record<InboxKindView, LucideIcon> = {
  approval: ShieldCheck,
  input_request: MessageCircleQuestionMark,
  result: Sparkles,
};

/**
 * One line of the list. Reads top to bottom as: what it is, what will happen
 * in plain words, then the small facts (kind, expiry). The unread dot sits on
 * the avatar so it never moves the text.
 */
export function InboxRow({
  item,
  text,
  open,
  cursor,
  delay,
  onOpen,
}: {
  item: InboxItemView;
  text: InboxText;
  open: boolean;
  cursor: boolean;
  /** Stagger of the entrance, in ms. */
  delay: number;
  onOpen: (id: string) => void;
}) {
  const t = useTranslations('inbox_ui');
  const Icon = KIND_ICON[item.kind];
  // Only something still waiting for a person has a deadline worth showing.
  const expiry = item.state === 'open' ? text.expiry(item.expires_at) : null;
  const urgent = item.state === 'open' && expiryHint(item.expires_at, text.now) !== null;

  return (
    <li className="anim-rise" style={{ '--d': `${delay}ms` } as React.CSSProperties}>
      <button
        type="button"
        data-item-id={item.id}
        aria-current={open ? 'true' : undefined}
        onClick={() => onOpen(item.id)}
        className={cn(
          'group relative flex w-full cursor-pointer items-start gap-3 rounded-md px-3 py-3 text-start transition-colors duration-150',
          'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-(--color-focus)',
          open ? 'bg-surface-tint' : cursor ? 'bg-(--state-hover)' : 'hover:bg-(--state-hover)',
        )}
      >
        <span className="relative shrink-0">
          <InboxAvatar slug={item.agent_slug} size={40} />
          {item.unread ? (
            <span className="absolute -end-1 -top-1 flex size-3 items-center justify-center rounded-full bg-surface">
              <span aria-hidden="true" className="size-2 rounded-full bg-action-primary" />
              <span className="sr-only">{t('unread')}</span>
            </span>
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={cn('min-w-0 flex-1 truncate text-sm text-text', item.unread ? 'font-semibold' : 'font-medium')}>
              {item.title}
            </span>
            <time
              dateTime={item.created_at}
              title={text.exact(item.created_at)}
              className="shrink-0 text-xs text-text-tertiary"
            >
              {text.ago(item.created_at)}
            </time>
          </span>
          <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-text-secondary">
            {text.sentence(item)}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-tertiary">
            <span className="inline-flex items-center gap-1">
              <Icon aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
              {text.kindLabel(item.kind)}
            </span>
            {expiry ? <span className={cn(urgent && 'font-medium text-warning')}>{expiry}</span> : null}
          </span>
        </span>
      </button>
    </li>
  );
}
