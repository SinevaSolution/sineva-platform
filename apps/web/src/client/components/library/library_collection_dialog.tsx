'use client';

import * as React from 'react';
import { SNBanner, SNButton, SNDialog, SNField, SNInput, SNSelect } from '@sineva/ui';
import { useTranslations } from '@/i18n/provider';
import type { ShellSpecialistView } from '@/shared/shell_view';
import { LibraryAccessPicker } from './library_access_picker';
import {
  accessSummary,
  flattenCollectionTree,
  scopeInputs,
  type AccessChoice,
  type CollectionNode,
  type ScopeInput,
} from './library_model';

export type CollectionDialogMode = { kind: 'create'; parentId: string | null } | { kind: 'edit'; node: CollectionNode };

export interface CollectionValues {
  name: string;
  parent_id: string | null;
  scopes: ScopeInput[];
}

const TOP = '__top__';
/** Parents deeper than this would put the new collection past the third level. */
const MAX_PARENT_DEPTH_INDEX = 1;

function descendantIds(node: CollectionNode): Set<string> {
  const ids = new Set<string>();
  const walk = (current: CollectionNode) => {
    for (const child of current.children) {
      ids.add(child.id);
      walk(child);
    }
  };
  walk(node);
  return ids;
}

/**
 * One dialog for a new collection and for the settings of an existing one:
 * name, where it sits, and who can use it. A new collection starts with its
 * parent's access (Everyone at the top), and picking another parent moves that
 * starting point until the person touches the access themselves.
 */
export function LibraryCollectionDialog({
  mode,
  tree,
  specialists,
  pending,
  error,
  onSubmit,
  onClose,
}: {
  mode: CollectionDialogMode;
  tree: readonly CollectionNode[];
  specialists: readonly ShellSpecialistView[];
  pending: boolean;
  error: string | null;
  onSubmit: (values: CollectionValues) => void;
  onClose: () => void;
}) {
  const t = useTranslations('library_ui');
  const flat = React.useMemo(() => flattenCollectionTree(tree), [tree]);
  const editing = mode.kind === 'edit' ? mode.node : null;
  const initialParent = mode.kind === 'create' ? mode.parentId : (editing?.parent_id ?? null);
  const accessOf = (parentId: string | null): AccessChoice =>
    accessSummary(flat.find((node) => node.id === parentId)?.scopes ?? [{ scope_type: 'workspace', scope_ref: null }]);

  const [name, setName] = React.useState(editing?.name ?? '');
  const [parentId, setParentId] = React.useState<string | null>(initialParent);
  const [access, setAccess] = React.useState<AccessChoice>(
    editing ? accessSummary(editing.scopes) : accessOf(initialParent),
  );
  const [accessTouched, setAccessTouched] = React.useState(editing !== null);

  const blocked = editing ? new Set([editing.id, ...descendantIds(editing)]) : new Set<string>();
  const parents = flat.filter((node) => !blocked.has(node.id) && node.depth <= MAX_PARENT_DEPTH_INDEX);
  const scopes = scopeInputs(access);
  const trimmed = name.trim();

  return (
    <SNDialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
      title={editing ? t('dialog.edit_title') : t('dialog.create_title')}
      closeLabel={t('close')}
      footer={
        <>
          <SNButton disabled={pending} onClick={onClose}>
            {t('cancel')}
          </SNButton>
          <SNButton
            variant="primary"
            loading={pending}
            disabled={!trimmed || scopes === null}
            onClick={() => {
              if (trimmed && scopes) onSubmit({ name: trimmed, parent_id: parentId, scopes });
            }}
          >
            {editing ? t('save') : t('dialog.create')}
          </SNButton>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed && scopes && !pending) onSubmit({ name: trimmed, parent_id: parentId, scopes });
        }}
      >
        <SNField label={t('dialog.name')} required>
          <SNInput value={name} maxLength={80} autoFocus onChange={(event) => setName(event.target.value)} />
        </SNField>
        <SNField label={t('dialog.inside')}>
          <SNSelect
            value={parentId ?? TOP}
            onValueChange={(value) => {
              const next = value === TOP ? null : value;
              setParentId(next);
              if (!accessTouched) setAccess(accessOf(next));
            }}
            options={[
              { value: TOP, label: t('dialog.top') },
              ...parents.map((node) => ({ value: node.id, label: `${' '.repeat(node.depth)}${node.name}` })),
            ]}
          />
        </SNField>
        <fieldset className="space-y-2">
          <legend className="text-[13px] font-medium text-text">{t('access.label')}</legend>
          <LibraryAccessPicker
            value={access}
            specialists={specialists}
            invalid={scopes === null}
            onChange={(next) => {
              setAccessTouched(true);
              setAccess(next);
            }}
          />
          {editing ? <p className="text-xs text-text-secondary">{t('dialog.access_note')}</p> : null}
        </fieldset>
        {error ? <SNBanner tone="danger">{error}</SNBanner> : null}
        {/* Enter in the name field submits through the form. */}
        <button type="submit" hidden tabIndex={-1} aria-hidden="true" />
      </form>
    </SNDialog>
  );
}
