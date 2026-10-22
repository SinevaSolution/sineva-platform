'use client';

import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/client/components/ui/cn';
import { useTranslations } from '@/i18n/provider';
import {
  SNConfirmDialog,
  SNDropdownMenu,
  SNDropdownMenuContent,
  SNDropdownMenuItem,
  SNDropdownMenuTrigger,
  SNIconButton,
} from '@sineva/ui';

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
      <SNDropdownMenu>
        <SNDropdownMenuTrigger asChild>
          <SNIconButton
            ref={triggerRef}
            label={t('options_for', { title })}
            tooltip={t('options_tooltip')}
            size="xs"
            className={cn('data-[state=open]:bg-(--state-hover) data-[state=open]:text-text', triggerClassName)}
          >
            <MoreHorizontal aria-hidden="true" />
          </SNIconButton>
        </SNDropdownMenuTrigger>
        <SNDropdownMenuContent
          side={side}
          align={align}
          onCloseAutoFocus={(e) => {
            if (keepFocusAway.current) {
              e.preventDefault();
              keepFocusAway.current = false;
            }
          }}
          className="w-40"
        >
          <SNDropdownMenuItem
            onSelect={() => {
              keepFocusAway.current = true;
              onRename();
            }}
          >
            <Pencil aria-hidden="true" />
            {t('rename')}
          </SNDropdownMenuItem>
          <SNDropdownMenuItem
            destructive
            onSelect={() => {
              keepFocusAway.current = true;
              setConfirming(true);
            }}
          >
            <Trash2 aria-hidden="true" />
            {t('delete')}
          </SNDropdownMenuItem>
        </SNDropdownMenuContent>
      </SNDropdownMenu>

      <SNConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('delete_title')}
        description={t('delete_body')}
        confirmLabel={t('delete_confirm')}
        pendingLabel={t('deleting')}
        cancelLabel={t('delete_cancel')}
        destructive
        pending={deleting}
        onConfirm={() => void confirmDelete()}
        onCloseAutoFocus={(e) => {
          // The menu item that opened the dialog is gone; the button is the
          // nearest thing that still exists. After a delete the host may
          // have removed the button too, in which case focus stays on body.
          e.preventDefault();
          triggerRef.current?.focus();
        }}
      />
    </>
  );
}
