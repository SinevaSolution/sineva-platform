'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { SNButton, SNConfirmDialog, snToast } from '@sineva/ui';
import { PresetEmptyState } from '@/client/components/ui/empty_state';
import { useApiErrorText } from '@/client/lib/use_api_error';
import { useTranslations } from '@/i18n/provider';
import type { ShellSpecialistView } from '@/shared/shell_view';
import type { SquadTemplateView, SquadView } from '@/shared/squad_view';
import { SquadCard } from './squad_card';
import { SquadFormDialog, type SquadFormMode } from './squad_form_dialog';
import { SquadTemplates } from './squad_templates';
import { squadApi, type SquadFormValues } from './use_squad_api';

type Confirm = { kind: 'archive' | 'delete'; squad: SquadView } | null;

/**
 * The Squads page: your squads as cards, the ready-made ones below, and one
 * panel for creating and editing. Every change goes through the API and then
 * refreshes the server page, so what is on screen is what is stored.
 */
export function SquadsScreen({
  workspaceId,
  workspaceSlug,
  squads,
  templates,
  specialists,
  canCreate,
  canManage,
  openEditId = null,
}: {
  workspaceId: string;
  workspaceSlug: string;
  squads: SquadView[];
  templates: SquadTemplateView[];
  /** The specialists this person can add to a squad. */
  specialists: ShellSpecialistView[];
  canCreate: boolean;
  /** Owner or Admin. */
  canManage: boolean;
  /** `?edit=` from a "Fix this squad" link. */
  openEditId?: string | null;
}) {
  const t = useTranslations('squads_ui');
  const router = useRouter();
  const errorText = useApiErrorText();
  const api = React.useMemo(() => squadApi(workspaceId), [workspaceId]);
  const [mode, setMode] = React.useState<SquadFormMode | null>(() => {
    const target = openEditId ? squads.find((squad) => squad.id === openEditId && squad.can_edit && squad.status === 'active') : undefined;
    return target ? { kind: 'edit', squad: target } : null;
  });
  const [confirm, setConfirm] = React.useState<Confirm>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const active = squads.filter((squad) => squad.status === 'active');
  const archived = squads.filter((squad) => squad.status === 'archived');

  async function run(work: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await work();
      return true;
    } catch (failure) {
      setError(errorText(failure));
      return false;
    } finally {
      setPending(false);
    }
  }

  async function submit(values: SquadFormValues) {
    if (!mode) return;
    const ok = await run(async () => {
      if (mode.kind === 'edit') {
        await api.update(mode.squad, values);
        snToast.success(t('toast.saved'));
        return;
      }
      const created = await api.create(values);
      snToast.success(t('toast.created'));
      router.push(`/w/${workspaceSlug}/squads/${created.id}`);
    });
    if (ok) {
      setMode(null);
      router.refresh();
    }
  }

  async function confirmed() {
    if (!confirm) return;
    const ok = await run(async () => {
      if (confirm.kind === 'delete') {
        await api.remove(confirm.squad.id);
        snToast.success(t('toast.deleted'));
      } else {
        await api.setStatus(confirm.squad.id, 'archived');
        snToast.success(t('toast.archived'));
      }
    });
    if (ok) {
      setConfirm(null);
      router.refresh();
    }
  }

  async function restore(squad: SquadView) {
    // No dialog is open for a restore, so a failure is a toast, not a banner.
    try {
      await api.setStatus(squad.id, 'active');
      snToast.success(t('toast.restored'));
      router.refresh();
    } catch (failure) {
      snToast.error(errorText(failure));
    }
  }

  const startCreate = () => {
    setError(null);
    setMode({ kind: 'create', template: null });
  };
  const card = (squad: SquadView) => (
    <SquadCard
      key={squad.id}
      squad={squad}
      specialists={specialists}
      href={`/w/${workspaceSlug}/squads/${squad.id}`}
      canManage={canManage}
      onEdit={() => {
        setError(null);
        setMode({ kind: 'edit', squad });
      }}
      onArchive={() => {
        setError(null);
        setConfirm({ kind: 'archive', squad });
      }}
      onRestore={() => void restore(squad)}
      onDelete={() => {
        setError(null);
        setConfirm({ kind: 'delete', squad });
      }}
    />
  );

  return (
    <section className="mx-auto w-full max-w-6xl space-y-8 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-text sm:text-3xl">{t('title')}</h1>
          <p className="max-w-xl text-[15px] text-text-secondary">{t('subtitle')}</p>
        </div>
        {canCreate && squads.length > 0 ? (
          <SNButton variant="primary" onClick={startCreate}>
            <Plus aria-hidden="true" />
            {t('new')}
          </SNButton>
        ) : null}
      </header>

      {squads.length === 0 ? (
        <PresetEmptyState preset="squads_list" onAction={canCreate ? startCreate : undefined} headingLevel={2} />
      ) : (
        <>
          {active.length > 0 ? (
            <ul aria-label={t('list_label')} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {active.map(card)}
            </ul>
          ) : null}
          {archived.length > 0 ? (
            <section aria-labelledby="squads-archived" className="space-y-3">
              <h2 id="squads-archived" className="text-sm font-medium text-text-secondary">
                {t('status_archived')}
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{archived.map(card)}</ul>
            </section>
          ) : null}
        </>
      )}

      {canCreate ? (
        <SquadTemplates
          templates={templates}
          specialists={specialists}
          onUse={(template) => {
            setError(null);
            setMode({ kind: 'create', template });
          }}
        />
      ) : null}

      {mode ? (
        <SquadFormDialog
          key={mode.kind === 'edit' ? mode.squad.id : (mode.template?.slug ?? 'new')}
          mode={mode}
          specialists={specialists}
          pending={pending}
          error={error}
          onSubmit={(values) => void submit(values)}
          onClose={() => setMode(null)}
        />
      ) : null}

      <SNConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={confirm ? t(confirm.kind === 'delete' ? 'confirm.delete_title' : 'confirm.archive_title', { name: confirm.squad.name }) : ''}
        description={confirm ? t(confirm.kind === 'delete' ? 'confirm.delete_body' : 'confirm.archive_body') : ''}
        confirmLabel={t(confirm?.kind === 'delete' ? 'confirm.delete_action' : 'confirm.archive_action')}
        cancelLabel={t('cancel')}
        destructive={confirm?.kind === 'delete'}
        pending={pending}
        error={error}
        onConfirm={() => void confirmed()}
      />
    </section>
  );
}
