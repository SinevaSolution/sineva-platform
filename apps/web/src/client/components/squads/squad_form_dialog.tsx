'use client';

import * as React from 'react';
import { SNBanner, SNButton, SNDrawer, SNField, SNInput, SNSelect, SNTextarea } from '@sineva/ui';
import { cn } from '@/client/components/ui/cn';
import { SNSpecialistTile } from '@/client/components/ui/sn_specialist_tile';
import { useTranslations } from '@/i18n/provider';
import type { ShellSpecialistView } from '@/shared/shell_view';
import type { SquadTemplateView, SquadView } from '@/shared/squad_view';
import { memberLimitProblem, SQUAD_GOAL_MAX, SQUAD_MEMBERS_MAX, SQUAD_MEMBERS_MIN } from './squad_model';
import type { SquadFormValues } from './use_squad_api';

export type SquadFormMode =
  | { kind: 'create'; template: SquadTemplateView | null }
  | { kind: 'edit'; squad: SquadView };

const SINO = '__sino__';

function initialValues(mode: SquadFormMode): SquadFormValues {
  if (mode.kind === 'edit') {
    const { squad } = mode;
    return {
      name: squad.name,
      goal: squad.goal,
      member_slugs: squad.members.map((member) => member.agent_slug),
      lead_type: squad.lead_type,
      lead_agent_slug: squad.lead_agent_slug,
      template_slug: squad.template_slug,
    };
  }
  const template = mode.template;
  return {
    name: template?.name ?? '',
    goal: template?.goal ?? '',
    member_slugs: template ? [...template.member_slugs] : [],
    lead_type: template?.lead_type ?? 'sino',
    lead_agent_slug: null,
    template_slug: template?.slug ?? null,
  };
}

/**
 * Create and edit in one panel: a side sheet on wide screens and a bottom
 * sheet under 768 px (SNDrawer does the switch). The actions stay pinned at
 * the bottom, so they sit above the keyboard on a phone. Member limits are
 * explained with the limit and the count, and only enforced for real by the
 * server.
 */
export function SquadFormDialog({
  mode,
  specialists,
  pending,
  error,
  onSubmit,
  onClose,
}: {
  mode: SquadFormMode;
  /** The specialists this person can add. */
  specialists: readonly ShellSpecialistView[];
  pending: boolean;
  error: string | null;
  onSubmit: (values: SquadFormValues) => void;
  onClose: () => void;
}) {
  const t = useTranslations('squads_ui');
  const [values, setValues] = React.useState<SquadFormValues>(() => initialValues(mode));
  const [touched, setTouched] = React.useState(false);
  const editing = mode.kind === 'edit';

  const problem = memberLimitProblem(values.member_slugs.length);
  const name = values.name.trim();
  const goal = values.goal.trim();
  const goalLength = [...values.goal].length;
  const valid = name.length > 0 && goal.length > 0 && goalLength <= SQUAD_GOAL_MAX && problem === null;
  // A person in a hurry sees what is missing only after the first try.
  const showMembersProblem = problem !== null && (touched || values.member_slugs.length > SQUAD_MEMBERS_MAX);

  function toggle(slug: string) {
    setTouched(true);
    setValues((prev) => {
      const has = prev.member_slugs.includes(slug);
      const member_slugs = has ? prev.member_slugs.filter((entry) => entry !== slug) : [...prev.member_slugs, slug];
      // A lead who leaves the squad goes back to Sino, so the form never holds a lead who is not a member.
      const leadGone = prev.lead_type === 'member' && prev.lead_agent_slug !== null && !member_slugs.includes(prev.lead_agent_slug);
      return { ...prev, member_slugs, ...(leadGone ? { lead_type: 'sino' as const, lead_agent_slug: null } : {}) };
    });
  }

  function submit() {
    setTouched(true);
    if (!valid || pending) return;
    onSubmit({ ...values, name, goal });
  }

  const leadOptions = [
    { value: SINO, label: t('form.lead_sino') },
    ...values.member_slugs.map((slug) => ({
      value: slug,
      label: specialists.find((s) => s.agent_slug === slug)?.display_name ?? slug,
    })),
  ];

  return (
    <SNDrawer
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
      title={editing ? t('form.edit_title') : t('form.create_title')}
      showTitle
      side="end"
      width="panel"
      closeLabel={t('close')}
    >
      <form
        className="flex max-h-[85dvh] flex-col md:max-h-none md:h-full"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4 pt-3">
          {mode.kind === 'create' && mode.template ? (
            <SNBanner tone="info">{t('form.template_note', { name: mode.template.name })}</SNBanner>
          ) : null}
          <SNField label={t('form.name')} required>
            <SNInput value={values.name} maxLength={60} autoFocus onChange={(event) => setValues({ ...values, name: event.target.value })} />
          </SNField>
          <SNField label={t('form.goal')} hint={t('form.goal_hint')} required>
            <SNTextarea
              value={values.goal}
              max={SQUAD_GOAL_MAX}
              formatCounter={(count, max) => t('form.goal_counter', { count, max })}
              onChange={(event) => setValues({ ...values, goal: event.target.value })}
            />
          </SNField>
          <fieldset className="space-y-2">
            <legend className="text-[13px] font-medium text-text">{t('form.members')}</legend>
            <p className="text-[13px] text-text-tertiary">{t('form.members_hint')}</p>
            <ul className="grid grid-cols-2 gap-2">
              {specialists.map((specialist) => {
                const on = values.member_slugs.includes(specialist.agent_slug);
                return (
                  <li key={specialist.agent_slug}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(specialist.agent_slug)}
                      className={cn(
                        'flex min-h-11 w-full items-center gap-2 rounded-md border px-2.5 py-2 text-start text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                        on ? 'border-focus bg-surface-tint text-text-brand' : 'border-border-strong bg-surface text-text-secondary hover:bg-(--state-hover) hover:text-text',
                      )}
                    >
                      <SNSpecialistTile agentSlug={specialist.agent_slug} name={specialist.display_name} size="md" />
                      <span className="min-w-0 truncate">{specialist.display_name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {showMembersProblem && problem ? (
              <p role="alert" className="text-[13px] text-danger">
                {t('form.members_limit', { min: SQUAD_MEMBERS_MIN, max: SQUAD_MEMBERS_MAX, count: problem.count })}
              </p>
            ) : null}
          </fieldset>
          <SNField label={t('form.lead')}>
            <SNSelect
              value={values.lead_type === 'member' && values.lead_agent_slug ? values.lead_agent_slug : SINO}
              onValueChange={(value) =>
                setValues({ ...values, lead_type: value === SINO ? 'sino' : 'member', lead_agent_slug: value === SINO ? null : value })
              }
              options={leadOptions}
            />
          </SNField>
          <div className="rounded-md bg-canvas-alt p-3">
            <p className="text-[13px] font-medium text-text">{t('form.library')}</p>
            <p className="mt-0.5 text-[13px] text-text-secondary">{t('form.library_hint')}</p>
            {mode.kind === 'create' && mode.template ? (
              <p className="mt-1.5 text-[13px] text-text-secondary">{t('template_folders', { folders: mode.template.library_folders.join(', ') })}</p>
            ) : null}
          </div>
          {error ? <SNBanner tone="danger">{error}</SNBanner> : null}
        </div>
        {/* Pinned, so the main action stays above the phone keyboard. */}
        <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-canvas-alt px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <SNButton type="button" disabled={pending} onClick={onClose}>
            {t('cancel')}
          </SNButton>
          <SNButton type="submit" variant="primary" loading={pending} disabled={!valid && touched}>
            {editing ? t('form.save') : t('form.create')}
          </SNButton>
        </div>
      </form>
    </SNDrawer>
  );
}
