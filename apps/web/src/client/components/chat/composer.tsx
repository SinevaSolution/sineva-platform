'use client';

import { ArrowUp, AtSign, Plus } from 'lucide-react';
import * as React from 'react';
import { snToast, SNTooltip } from '@sineva/ui';
import { cn } from '@/client/components/ui/cn';
import { useTranslations } from '@/i18n/provider';
import type { ShellSpecialistView } from '@/shared/shell_view';
import { insertMention } from './mention_insert';
import { mentionEndingAt, splitMentions } from './mention_segments';
import { MentionMenu } from './mention_menu';
import { activeMention, applyMention, filterSpecialists } from './mention_query';

/** Lets a parent drop a specialist mention into the draft (Home chips). */
export type ComposerHandle = {
  mention: (displayName: string) => void;
  /** Replace the draft (starter prompts) and focus the box. */
  fill: (text: string) => void;
};

const MAX_LENGTH = 8000;
// The counter stays hidden until the limit is near, so it never nags.
const COUNTER_FROM = 7000;

type Mention = { start: number; query: string };

/**
 * Message box. Enter sends on devices with a fine pointer (keyboard and
 * mouse); on touch devices Enter adds a line and the button sends, because
 * phone keyboards have no Shift+Enter. The textarea grows up to 8 lines.
 * With `specialists`, typing `@` opens a suggestion menu (arrows move, Enter
 * or Tab insert, Escape closes) following the combobox/listbox ARIA pattern.
 */
export function Composer({
  onSubmit,
  placeholder,
  disabled = false,
  autoFocus = false,
  size = 'md',
  specialists = [],
  onDraftChange,
  ref: handleRef,
}: {
  ref?: React.Ref<ComposerHandle>;
  onSubmit: (text: string) => Promise<boolean>;
  placeholder: string;
  disabled?: boolean;
  autoFocus?: boolean;
  size?: 'md' | 'lg';
  specialists?: ShellSpecialistView[];
  /** Called with the draft as it changes (the squad chat reads it to show the points line). Keep it stable. */
  onDraftChange?: (draft: string) => void;
}) {
  const t = useTranslations('chat');
  const [value, setValue] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [mention, setMention] = React.useState<Mention | null>(null);
  const [activeIndex, setActiveIndex] = React.useState(0);
  // Escape closes the menu for the token it was open on; typing a new `@`
  // elsewhere (different start) opens it again.
  const [closedAt, setClosedAt] = React.useState<number | null>(null);
  const ref = React.useRef<HTMLTextAreaElement>(null);
  // Caret to restore after React commits a programmatic text change. Setting
  // it inline would be overwritten when the controlled value re-renders.
  const pendingCaret = React.useRef<number | null>(null);
  const menuId = React.useId();

  const items = React.useMemo(
    () => (mention ? filterSpecialists(specialists, mention.query) : []),
    [mention, specialists],
  );
  const menuOpen = mention !== null && specialists.length > 0 && closedAt !== mention.start;

  // The menu opens downward. It flips up only when the composer sits so low
  // (the chat thread's bottom bar) that a downward menu would leave the
  // screen; measured once per opening, not on every keystroke.
  const formRef = React.useRef<HTMLFormElement>(null);
  const backdropRef = React.useRef<HTMLDivElement>(null);
  const mentionNames = React.useMemo(() => specialists.map((sp) => sp.display_name), [specialists]);
  const segments = React.useMemo(() => splitMentions(value, mentionNames), [value, mentionNames]);
  const hasPills = segments.some((seg) => seg.mention);
  const [menuPlacement, setMenuPlacement] = React.useState<'below' | 'above'>('below');
  React.useLayoutEffect(() => {
    if (!menuOpen || !formRef.current) return;
    const rect = formRef.current.getBoundingClientRect();
    const MENU_HEIGHT = 320;
    const below = window.innerHeight - rect.bottom;
    setMenuPlacement(below < MENU_HEIGHT && rect.top > below ? 'above' : 'below');
  }, [menuOpen]);
  // An empty result list shows the "no match" note but must not trap Enter,
  // otherwise a literal "@foo" could never be sent from the keyboard.
  const capturing = menuOpen && items.length > 0;
  const active = Math.min(activeIndex, Math.max(items.length - 1, 0));

  const focusEnd = React.useCallback(() => {
    // Focus after React commits the new value, caret at the end.
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }, []);

  React.useImperativeHandle(handleRef, () => ({
    mention: (displayName) => {
      setValue((draft) => insertMention(draft, displayName));
      focusEnd();
    },
    fill: (text) => {
      setValue(text.slice(0, MAX_LENGTH));
      focusEnd();
    },
  }));

  /** Recomputes the open token from the caret; keeps the highlight unless the token changed. */
  function sync(text: string, caret: number) {
    const next = activeMention(text, caret);
    if (next?.start !== mention?.start || next?.query !== mention?.query) {
      setMention(next);
      setActiveIndex(0);
    }
    if (!next) setClosedAt(null);
  }

  function commit(text: string, caret: number) {
    pendingCaret.current = caret;
    setValue(text);
    sync(text, caret);
  }

  function choose(item: ShellSpecialistView) {
    if (!mention) return;
    const el = ref.current;
    const caret = el?.selectionStart ?? mention.start + mention.query.length + 1;
    const next = applyMention(value, mention.start, caret, item.display_name);
    commit(next.text, next.caret);
    setClosedAt(null);
    setMention(null);
    el?.focus();
  }

  function openMentionMenu() {
    const el = ref.current;
    if (!el || disabled) return;
    const caret = el.selectionStart ?? value.length;
    const needsSpace = caret > 0 && !/\s/.test(value[caret - 1] ?? '');
    const insert = needsSpace ? ' @' : '@';
    if (value.length + insert.length > MAX_LENGTH) return;
    setClosedAt(null);
    commit(`${value.slice(0, caret)}${insert}${value.slice(el.selectionEnd ?? caret)}`, caret + insert.length);
    el.focus();
  }

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    if (pendingCaret.current !== null) {
      el.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  }, [value]);

  React.useEffect(() => {
    onDraftChange?.(value);
  }, [value, onDraftChange]);

  const trimmed = value.trim();
  const canSend = trimmed.length > 0 && !sending && !disabled;

  async function send() {
    if (!canSend) return;
    setSending(true);
    const ok = await onSubmit(trimmed);
    setSending(false);
    if (ok) {
      setValue('');
      setMention(null);
    }
    ref.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.nativeEvent.isComposing) return;
    // A mention pill deletes as one unit: Backspace right after it removes
    // the whole "@Name", like a chip, instead of one letter at a time.
    if (e.key === 'Backspace' && !e.shiftKey && !e.metaKey && !e.altKey && !e.ctrlKey) {
      const el = e.currentTarget;
      if (el.selectionStart === el.selectionEnd) {
        const hit = mentionEndingAt(value, el.selectionStart, mentionNames);
        if (hit) {
          e.preventDefault();
          const next = value.slice(0, hit.start) + value.slice(hit.end);
          setValue(next);
          requestAnimationFrame(() => el.setSelectionRange(hit.start, hit.start));
          return;
        }
      }
    }
    if (capturing) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setActiveIndex((active + step + items.length) % items.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const item = items[active];
        if (item) choose(item);
        return;
      }
    }
    if (menuOpen && e.key === 'Escape') {
      e.preventDefault();
      setClosedAt(mention?.start ?? null);
      return;
    }
    const finePointer = window.matchMedia('(pointer: fine)').matches;
    if (e.key === 'Enter' && !e.shiftKey && finePointer) {
      e.preventDefault();
      void send();
    }
  }

  function syncFromEvent(e: React.SyntheticEvent<HTMLTextAreaElement>) {
    sync(e.currentTarget.value, e.currentTarget.selectionStart);
  }

  const iconButton =
    'flex size-8 items-center justify-center rounded-full text-text-secondary transition-[background-color,color] duration-150 hover:bg-(--state-hover) hover:text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus aria-disabled:opacity-50 aria-disabled:hover:bg-transparent aria-disabled:hover:text-text-secondary disabled:opacity-50';

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
      className={cn(
        'relative flex flex-col rounded-lg border border-border-strong bg-surface px-3 pb-2 pt-2.5 shadow-md transition-[border-color,box-shadow] duration-200 focus-within:border-focus focus-within:shadow-(--shadow-focus-halo)',
        size === 'lg' && 'px-4 pb-2.5 pt-3',
      )}
    >
      {menuOpen ? (
        <div
          className={cn(
            'absolute start-0 z-(--z-dropdown) w-[min(360px,100%)]',
            menuPlacement === 'below' ? 'top-full mt-2' : 'bottom-full mb-2',
          )}
        >
          <MentionMenu
            id={menuId}
            items={items}
            activeIndex={active}
            query={mention?.query ?? ''}
            onSelect={choose}
            onHover={setActiveIndex}
          />
        </div>
      ) : null}
      <label className="sr-only" htmlFor="composer-input">
        {t('composer.message_label')}
      </label>
      {/* Mention pills: a backdrop with the same box, font and wrapping as the
          textarea draws "@Name" as a pill; the textarea above stays native
          (IME, autocorrect, undo, screen readers). Pills use background and
          a spread shadow only, never padding or weight, so text widths and
          line breaks match the textarea exactly. */}
      <div className="relative">
        {hasPills ? (
          <div
            ref={backdropRef}
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-1 py-1.5 text-[15px] leading-6 text-text',
              size === 'lg' && 'text-base',
            )}
          >
            {segments.map((seg, i) =>
              seg.mention ? (
                <span
                  key={i}
                  className="rounded-xs bg-[color-mix(in_oklab,var(--color-focus)_16%,transparent)] text-text-brand shadow-[0_0_0_2px_color-mix(in_oklab,var(--color-focus)_16%,transparent)]"
                >
                  {seg.text}
                </span>
              ) : (
                <React.Fragment key={i}>{seg.text}</React.Fragment>
              ),
            )}
            {/* Keeps a trailing newline from collapsing so heights match. */}
            {'\u200b'}
          </div>
        ) : null}
        <textarea
          id="composer-input"
          ref={ref}
          rows={1}
          value={value}
          maxLength={MAX_LENGTH}
          autoFocus={autoFocus}
          disabled={disabled}
          placeholder={placeholder}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? menuId : undefined}
          aria-activedescendant={capturing ? `${menuId}-opt-${active}` : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            sync(e.target.value, e.target.selectionStart);
          }}
          onSelect={syncFromEvent}
          onKeyUp={syncFromEvent}
          onClick={syncFromEvent}
          onKeyDown={onKeyDown}
          onScroll={(e) => {
            if (backdropRef.current) backdropRef.current.scrollTop = e.currentTarget.scrollTop;
          }}
          className={cn(
            'relative min-h-9 w-full resize-none bg-transparent px-1 py-1.5 text-[15px] leading-6 text-text caret-fg outline-none placeholder:text-text-tertiary',
            size === 'lg' && 'min-h-11 text-base',
            hasPills && 'text-transparent',
          )}
        />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {specialists.length > 0 ? (
            <SNTooltip label={t('composer.mention_tooltip')} shortcut="@">
              <button
                type="button"
                disabled={disabled}
                aria-label={t('composer.mention_tooltip')}
                onClick={openMentionMenu}
                className={iconButton}
              >
                <AtSign aria-hidden="true" className="size-[18px]" strokeWidth={2} />
              </button>
            </SNTooltip>
          ) : null}
          <SNTooltip label={t('composer.attach_label')}>
            <button
              type="button"
              aria-disabled="true"
              aria-label={t('composer.attach_label')}
              onClick={() => snToast.info(t('composer.attach_toast'))}
              className={iconButton}
            >
              <Plus aria-hidden="true" className="size-[18px]" strokeWidth={2} />
            </button>
          </SNTooltip>
        </div>
        <div className="flex items-center gap-2.5">
          {value.length > COUNTER_FROM ? (
            <span
              role="status"
              className={cn('text-xs tabular-nums text-text-tertiary', value.length >= MAX_LENGTH && 'text-danger')}
            >
              {t('composer.counter', { count: value.length, max: MAX_LENGTH })}
            </span>
          ) : null}
          {/* aria-disabled, not disabled: a disabled button gets no pointer
              events, so its tooltip could never explain why it is off.
              send() already ignores the click while !canSend. */}
          <SNTooltip label={canSend ? t('composer.send_tooltip') : t('composer.send_disabled')} shortcut={canSend ? 'Enter' : undefined}>
            <button
              type="submit"
              aria-disabled={!canSend}
              aria-label={sending ? t('composer.sending') : t('composer.send_message')}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-action-primary text-text-inverse transition-[background-color,transform] duration-150 hover:bg-action-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:scale-90 aria-disabled:cursor-default aria-disabled:bg-border-strong aria-disabled:text-text-tertiary aria-disabled:active:scale-100"
            >
              <ArrowUp aria-hidden="true" className={cn('size-4', sending && 'animate-pulse')} strokeWidth={2.25} />
            </button>
          </SNTooltip>
        </div>
      </div>
    </form>
  );
}
