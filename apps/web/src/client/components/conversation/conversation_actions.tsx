'use client';

import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/client/components/ui/button';
import { cn } from '@/client/components/ui/cn';
import { Tooltip } from '@/client/components/ui/tooltip';
import { useTranslations } from '@/i18n/provider';

const itemClass =
  'flex h-8 cursor-default select-none items-center gap-2 rounded-xs px-2 text-[13px] text-text outline-none data-[highlighted]:bg-(--state-hover)';

/**
 * The "..." menu of one chat (Rename, Delete) plus the delete confirmation.
 * It renders the button, the menu and the dialog and nothing else: rename
 * happens inline in the host (the row or header owns the title), so
 * `onRename` just asks the host to switch to its edit field, and `onDelete`
 * runs the request and resolves with whether it worked.
 *
 * The dialog is a sibling of the menu, not a child of its content: content
 * unmounts when an item is chosen, and a dialog inside it would go with it.
 */
export function ConversationActions({
  title,
  onRename,
  onDelete,
  triggerClassName,
  side = 'bottom',
  align = 'end',
}: {
  /** Shown in the button's accessible name; null for an untitled chat. */
  title: string;
  onRename: () => void;
  onDelete: () => Promise<boolean>;
  triggerClassName?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
}) {
  const t = useTranslations('conversation');
  const [confirming, setConfirming] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  // Closing the menu normally hands focus back to its button. After Rename
  // that would steal focus from the field that just opened (and blur saves),
  // and after Delete it would fight the dialog's own focus handling.
  const keepFocusAway = React.useRef(false);

  async function confirmDelete() {
    setDeleting(true);
    const ok = await onDelete();
    setDeleting(false);
    // On failure the dialog stays so the person can retry or cancel; the
    // host already showed the error.
    if (ok) setConfirming(false);
  }

  return (
    <>
      <DropdownMenu.Root>
        <Tooltip label={t('options_tooltip')} side="top">
          <DropdownMenu.Trigger
            ref={triggerRef}
            aria-label={t('options_for', { title })}
            className={cn(
              'flex size-6 shrink-0 items-center justify-center rounded-xs text-text-secondary outline-none hover:bg-(--state-hover) hover:text-text focus-visible:ring-2 focus-visible:ring-focus/50 data-[state=open]:bg-(--state-hover) data-[state=open]:text-text [&_svg]:size-4',
              triggerClassName,
            )}
          >
            <MoreHorizontal aria-hidden="true" />
          </DropdownMenu.Trigger>
        </Tooltip>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side={side}
            align={align}
            sideOffset={6}
            collisionPadding={8}
            onCloseAutoFocus={(e) => {
              if (keepFocusAway.current) {
                e.preventDefault();
                keepFocusAway.current = false;
              }
            }}
            className="anim-swap z-(--z-dropdown) w-40 rounded-md border border-border bg-surface p-1 shadow-md"
          >
            <DropdownMenu.Item
              className={itemClass}
              onSelect={() => {
                keepFocusAway.current = true;
                onRename();
              }}
            >
              <Pencil aria-hidden="true" className="size-4" />
              {t('rename')}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={cn(itemClass, 'text-danger')}
              onSelect={() => {
                keepFocusAway.current = true;
                setConfirming(true);
              }}
            >
              <Trash2 aria-hidden="true" className="size-4" />
              {t('delete')}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <Dialog.Root open={confirming} onOpenChange={(open) => !deleting && setConfirming(open)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-(--z-modal) bg-scrim" />
          <Dialog.Content
            onCloseAutoFocus={(e) => {
              // The menu item that opened the dialog is gone; the button is the
              // nearest thing that still exists. After a delete the host may
              // have removed the button too, in which case focus stays on body.
              e.preventDefault();
              triggerRef.current?.focus();
            }}
            className="fixed start-1/2 top-1/2 z-(--z-modal) w-[calc(100vw-32px)] max-w-sm -translate-x-1/2 -translate-y-1/2 rtl:translate-x-1/2 rounded-md border border-border bg-surface p-5 shadow-md"
          >
            <Dialog.Title className="text-[15px] font-semibold text-text">{t('delete_title')}</Dialog.Title>
            <Dialog.Description className="mt-1.5 text-sm text-text-secondary">
              {t('delete_body')}
            </Dialog.Description>
            <div className="mt-5 flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button disabled={deleting}>{t('delete_cancel')}</Button>
              </Dialog.Close>
              <Button
                onClick={() => void confirmDelete()}
                disabled={deleting}
                className="border-transparent bg-danger text-text-inverse hover:bg-danger/90"
              >
                {deleting ? t('deleting') : t('delete_confirm')}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
