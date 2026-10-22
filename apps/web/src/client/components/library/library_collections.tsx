'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronRight, FolderClosed, FolderPlus, Layers, Library, MoreHorizontal, Settings2, Trash2 } from 'lucide-react';
import {
  SNButton,
  SNDropdownMenu,
  SNDropdownMenuContent,
  SNDropdownMenuItem,
  SNDropdownMenuTrigger,
  SNIconButton,
} from '@sineva/ui';
import { formatNumber } from '@sineva/ui/format';
import { cn } from '@/client/components/ui/cn';
import { useLocale, useTranslations } from '@/i18n/provider';
import type { CollectionNode } from './library_model';

/** A collection can sit three levels deep; a fourth is refused by the API, so the menu does not offer it. */
const MAX_DEPTH_INDEX = 2;

export interface LibraryCollectionsProps {
  tree: readonly CollectionNode[];
  total: number;
  inTop: number;
  /** `undefined` means all files, `root` means files outside every collection. */
  selected: string | undefined;
  /** Collections to keep open: the ancestors of the selected one. */
  openIds: readonly string[];
  hrefFor: (folderId: string | undefined) => string;
  canManage: boolean;
  onCreate: (parentId: string | null) => void;
  onSettings: (node: CollectionNode) => void;
  onDelete: (node: CollectionNode) => void;
  /** Closes the mobile sheet when a link is followed. */
  onNavigate?: () => void;
}

/**
 * The collections list: all files, files outside any collection, then the
 * nested collections with their counts. Each row is a link (the choice lives in
 * the URL), a chevron opens children, and the options menu holds the actions a
 * manager has. Collapsing is local state; the ancestors of the selected
 * collection start open so the current place is always visible.
 */
export function LibraryCollections(props: LibraryCollectionsProps) {
  const { tree, total, inTop, selected, hrefFor, canManage, onCreate, onNavigate } = props;
  const t = useTranslations('library_ui');
  const locale = useLocale();
  const [closedByUser, setClosedByUser] = React.useState<ReadonlySet<string>>(new Set());
  const [openedByUser, setOpenedByUser] = React.useState<ReadonlySet<string>>(new Set());

  const isOpen = (id: string) => (props.openIds.includes(id) || openedByUser.has(id)) && !closedByUser.has(id);
  function toggle(id: string) {
    if (isOpen(id)) {
      setClosedByUser((prev) => new Set(prev).add(id));
      setOpenedByUser((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } else {
      setOpenedByUser((prev) => new Set(prev).add(id));
      setClosedByUser((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <nav aria-label={t('collections.title')} className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="text-[15px] font-semibold text-text">{t('collections.title')}</h2>
        {canManage ? (
          <SNIconButton label={t('collections.new')} size="sm" variant="ghost" onClick={() => onCreate(null)}>
            <FolderPlus aria-hidden="true" />
          </SNIconButton>
        ) : null}
      </div>
      <ul className="space-y-0.5">
        <FixedRow
          icon={Library}
          label={t('collections.all')}
          count={formatNumber(total, locale)}
          href={hrefFor(undefined)}
          current={selected === undefined}
          onNavigate={onNavigate}
        />
        <FixedRow
          icon={Layers}
          label={t('collections.top')}
          count={formatNumber(inTop, locale)}
          href={hrefFor('root')}
          current={selected === 'root'}
          onNavigate={onNavigate}
        />
        {tree.map((node) => (
          <Branch
            key={node.id}
            node={node}
            selected={selected}
            isOpen={isOpen}
            toggle={toggle}
            hrefFor={hrefFor}
            canManage={canManage}
            onCreate={onCreate}
            onSettings={props.onSettings}
            onDelete={props.onDelete}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
      {canManage ? (
        <SNButton variant="ghost" size="sm" onClick={() => onCreate(null)} className="w-full justify-start">
          <FolderPlus aria-hidden="true" />
          {t('collections.new')}
        </SNButton>
      ) : null}
    </nav>
  );
}

const ROW =
  'group flex min-h-9 items-center gap-1 rounded-sm text-sm transition-colors motion-reduce:transition-none hover:bg-(--state-hover)';
const LINK =
  'flex min-w-0 flex-1 items-center gap-2 rounded-sm py-1.5 ps-2 pe-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

function FixedRow({
  icon: Icon,
  label,
  count,
  href,
  current,
  onNavigate,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;
  label: string;
  count: string;
  href: string;
  current: boolean;
  onNavigate?: () => void;
}) {
  return (
    <li className={cn(ROW, current && 'bg-surface-tint font-medium text-text-brand')}>
      <Link href={href} aria-current={current ? 'page' : undefined} onClick={onNavigate} className={LINK}>
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="pe-2 text-xs tabular-nums text-text-secondary">{count}</span>
      </Link>
    </li>
  );
}

function Branch({
  node,
  selected,
  isOpen,
  toggle,
  hrefFor,
  canManage,
  onCreate,
  onSettings,
  onDelete,
  onNavigate,
}: {
  node: CollectionNode;
  selected: string | undefined;
  isOpen: (id: string) => boolean;
  toggle: (id: string) => void;
  hrefFor: (folderId: string | undefined) => string;
  canManage: boolean;
  onCreate: (parentId: string | null) => void;
  onSettings: (node: CollectionNode) => void;
  onDelete: (node: CollectionNode) => void;
  onNavigate?: () => void;
}) {
  const t = useTranslations('library_ui');
  const locale = useLocale();
  const open = isOpen(node.id);
  const current = selected === node.id;
  const hasChildren = node.children.length > 0;
  // Keeps the menu from handing focus back to its button after it opened a dialog.
  const keepFocusAway = React.useRef(false);

  return (
    <li>
      <div className={cn(ROW, current && 'bg-surface-tint font-medium text-text-brand')} style={{ paddingInlineStart: `${node.depth * 14}px` }}>
        {hasChildren ? (
          <SNIconButton
            label={t(open ? 'collections.collapse' : 'collections.expand', { name: node.name })}
            tooltip={t(open ? 'collections.collapse_tip' : 'collections.expand_tip')}
            size="xs"
            variant="ghost"
            onClick={() => toggle(node.id)}
          >
            <ChevronRight aria-hidden="true" className={cn('transition-transform motion-reduce:transition-none rtl:-scale-x-100', open && 'rotate-90 rtl:rotate-90')} />
          </SNIconButton>
        ) : (
          <span aria-hidden="true" className="size-6 shrink-0" />
        )}
        <Link href={hrefFor(node.id)} aria-current={current ? 'page' : undefined} onClick={onNavigate} className={cn(LINK, 'ps-1')}>
          <FolderClosed aria-hidden="true" className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          <span className="text-xs tabular-nums text-text-secondary">{formatNumber(node.count, locale)}</span>
        </Link>
        {canManage ? (
          <SNDropdownMenu>
            <SNDropdownMenuTrigger asChild>
              <SNIconButton
                label={t('collections.options', { name: node.name })}
                tooltip={t('collections.options_tip')}
                size="xs"
                variant="ghost"
                className="data-[state=open]:bg-(--state-hover) data-[state=open]:text-text"
              >
                <MoreHorizontal aria-hidden="true" />
              </SNIconButton>
            </SNDropdownMenuTrigger>
            <SNDropdownMenuContent
              align="end"
              className="w-56"
              onCloseAutoFocus={(event) => {
                if (keepFocusAway.current) {
                  event.preventDefault();
                  keepFocusAway.current = false;
                }
              }}
            >
              <SNDropdownMenuItem
                onSelect={() => {
                  keepFocusAway.current = true;
                  onSettings(node);
                }}
              >
                <Settings2 aria-hidden="true" />
                {t('collections.settings')}
              </SNDropdownMenuItem>
              {node.depth < MAX_DEPTH_INDEX ? (
                <SNDropdownMenuItem
                  onSelect={() => {
                    keepFocusAway.current = true;
                    onCreate(node.id);
                  }}
                >
                  <FolderPlus aria-hidden="true" />
                  {t('collections.new_inside')}
                </SNDropdownMenuItem>
              ) : null}
              <SNDropdownMenuItem
                destructive
                onSelect={() => {
                  keepFocusAway.current = true;
                  onDelete(node);
                }}
              >
                <Trash2 aria-hidden="true" />
                {t('collections.delete')}
              </SNDropdownMenuItem>
            </SNDropdownMenuContent>
          </SNDropdownMenu>
        ) : null}
      </div>
      {hasChildren && open ? (
        <ul className="space-y-0.5">
          {node.children.map((child) => (
            <Branch
              key={child.id}
              node={child}
              selected={selected}
              isOpen={isOpen}
              toggle={toggle}
              hrefFor={hrefFor}
              canManage={canManage}
              onCreate={onCreate}
              onSettings={onSettings}
              onDelete={onDelete}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
