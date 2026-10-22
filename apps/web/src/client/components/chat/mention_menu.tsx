import * as React from 'react';
import type { ShellSpecialistView } from '@/shared/shell_view';
import { cn } from '@/client/components/ui/cn';
import { SinoFigure } from '@/client/components/ui/sino_figure';
import { specialistPose } from '@/client/components/ui/specialist_accent';
import { useTranslations } from '@/i18n/provider';

/**
 * Suggestion list shown above the composer while the user types an @mention.
 * Presentational: the composer owns the textarea, the active index and the
 * keyboard handling, and points `aria-activedescendant` at `${id}-opt-${i}`.
 * Rows swallow mousedown so the textarea keeps focus (and its caret).
 */
export function MentionMenu({
  id,
  items,
  activeIndex,
  query,
  onSelect,
  onHover,
}: {
  id: string;
  items: ShellSpecialistView[];
  activeIndex: number;
  /** Only used for the empty-state message. */
  query: string;
  onSelect: (item: ShellSpecialistView) => void;
  onHover: (index: number) => void;
}) {
  const t = useTranslations('chat');
  const shell = 'anim-swap rounded-md bg-surface p-1 shadow-md ring-1 ring-border';
  const listRef = React.useRef<HTMLUListElement>(null);

  // Keep the keyboard-selected row visible inside the scrolling list.
  React.useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[id="${id}-opt-${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [id, activeIndex]);

  // The empty state is not a listbox: a listbox with no options is invalid
  // ARIA. The id stays so the textarea's aria-controls never dangles.
  if (items.length === 0) {
    return (
      <div id={id} role="status" className={cn(shell, 'px-3 py-2.5 text-sm text-text-tertiary')}>
        {t('mention_menu.empty', { query })}
      </div>
    );
  }

  return (
    <div className={shell}>
      <p className="px-2.5 pb-1 pt-1.5 text-xs text-text-tertiary">{t('mention_menu.heading')}</p>
      {/* Header stays put; only the options scroll, and the scroll never
          chains to the page behind. */}
      <ul
        ref={listRef}
        id={id}
        role="listbox"
        aria-label={t('mention_menu.list_label')}
        className="max-h-64 overflow-y-auto overscroll-contain"
      >
        {items.map((item, i) => (
          <li
            key={item.agent_slug}
            id={`${id}-opt-${i}`}
            role="option"
            aria-selected={i === activeIndex}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(item)}
            onMouseEnter={() => onHover(i)}
            className={cn(
              'flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm text-text',
              i === activeIndex && 'bg-(--state-hover)',
            )}
          >
            <SinoFigure pose={specialistPose(item.agent_slug)} size={32} />
            <span className="font-medium">{item.display_name}</span>
            <span className="min-w-0 flex-1 truncate text-text-tertiary">{item.role_title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
