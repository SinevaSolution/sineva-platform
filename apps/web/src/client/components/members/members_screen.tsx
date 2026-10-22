'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Pencil, Trash2 } from 'lucide-react';
import {
  SNBadge,
  SNBanner,
  SNButton,
  SNCheckbox,
  SNConfirmDialog,
  SNDialog,
  SNDrawer,
  SNField,
  SNIconButton,
  SNInput,
  SNSelect,
  snToast,
} from '@sineva/ui';
import { formatDate, formatRelativeTime } from '@sineva/ui/format';
import { ReauthDialog } from '@/client/components/auth/reauth_dialog';
import { PresetEmptyState } from '@/client/components/ui/empty_state';
import { apiRequest } from '@/client/lib/api';
import {
  clearOAuthNoticeFromUrl,
  isFreshSessionRequired,
  savePendingReauth,
  takePendingReauth,
  type PendingReauth,
} from '@/client/lib/fresh_session';
import { useApiErrorText } from '@/client/lib/use_api_error';
import { SettingsPageHeader } from '@/client/components/settings/settings_page_header';
import { useLocale, useTranslations } from '@/i18n/provider';
import type {
  InvitationCreatedView,
  InvitationView,
  MemberRole,
  MemberView,
  OwnershipTransferView,
} from '@/shared/members_view';
import type { ShellSpecialistView } from '@/shared/shell_view';
import type { ReauthMethods } from '@/shared/sign_in_methods_view';

const roleKeys = {
  owner: 'roles.owner',
  admin: 'roles.admin',
  member: 'roles.member',
  viewer: 'roles.viewer',
} as const;

type Action = () => Promise<void>;

interface Confirmation {
  title: string;
  body: string;
  label: string;
  action: Action;
  success: string;
  /** Present for sensitive actions: what to run again after the person re-confirms. */
  resume?: PendingReauth;
}

// Desktop reads as a table (one grid per row, so the columns line up); below
// the md breakpoint each row becomes a card. One DOM for both keeps the list
// a single source of truth for tests and screen readers.
const MANAGER_COLUMNS = 'md:grid-cols-[minmax(0,2fr)_7rem_minmax(0,1.2fr)_8rem_4.5rem]';
const LIMITED_COLUMNS = 'md:grid-cols-[minmax(0,2fr)_7rem]';

const NOTICE_KEYS = {
  mismatch: 'notice.mismatch',
  cancelled: 'notice.cancelled',
  failed: 'notice.failed',
  not_configured: 'notice.not_configured',
} as const;

export function MembersScreen({
  workspaceId,
  role,
  members,
  invitations,
  transfer,
  specialists,
  reauthMethods = { has_password: true, providers: [] },
  initialNotice,
}: {
  workspaceId: string;
  role: MemberRole;
  members: MemberView[];
  invitations: InvitationView[];
  transfer: OwnershipTransferView | null;
  specialists: ShellSpecialistView[];
  /** How this person can re-confirm: password and linked, configured providers. */
  reauthMethods?: ReauthMethods;
  /** One-shot `?oauth=` code the page was opened with after a provider round trip. */
  initialNotice?: string;
}) {
  const t = useTranslations('members');
  const tReauth = useTranslations('reauth');
  const locale = useLocale();
  const errorText = useApiErrorText();
  const router = useRouter();
  const base = `/api/v1/workspaces/${workspaceId}`;
  const manager = role === 'owner' || role === 'admin';
  const [pending, setPending] = React.useState(false);
  // A cancelled or mismatched provider round trip shows its reason straight away.
  const [error, setError] = React.useState<string | null>(() =>
    initialNotice && initialNotice !== 'reauthenticated'
      ? tReauth(NOTICE_KEYS[initialNotice as keyof typeof NOTICE_KEYS] ?? NOTICE_KEYS.failed)
      : null,
  );
  const [editor, setEditor] = React.useState<MemberView | 'invite' | null>(null);
  const [created, setCreated] = React.useState<InvitationCreatedView | null>(null);
  const [confirmation, setConfirmation] = React.useState<Confirmation | null>(null);
  const [transferOpen, setTransferOpen] = React.useState(false);
  const [target, setTarget] = React.useState('');
  const [reauth, setReauth] = React.useState(false);
  const retry = React.useRef<{ action: Action; success: string; resume?: PendingReauth } | null>(
    null,
  );

  async function run(
    action: Action,
    options: { success?: string; resume?: PendingReauth } = {},
  ): Promise<void> {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await action();
      setConfirmation(null);
      if (options.success) snToast.success(options.success);
      router.refresh();
    } catch (err) {
      if (options.resume && isFreshSessionRequired(err)) {
        // Not "you cannot do this": the session is just old. Ask once, then continue.
        retry.current = { action, success: options.success ?? '', resume: options.resume };
        setConfirmation(null);
        setTransferOpen(false);
        setReauth(true);
      } else setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  async function confirmWithPassword(password: string) {
    await apiRequest('/api/v1/auth/reauthenticate', { method: 'POST', body: { password } });
    const waiting = retry.current;
    retry.current = null;
    setReauth(false);
    if (waiting) await run(waiting.action, { success: waiting.success });
  }

  function leaveForProvider() {
    if (retry.current?.resume) savePendingReauth(retry.current.resume);
  }

  const removeAction = (memberId: string): Action => async () => {
    await apiRequest(`${base}/members/${memberId}`, { method: 'DELETE' });
  };
  const transferAction = (targetId: string): Action => async () => {
    await apiRequest(`${base}/transfer-ownership`, {
      method: 'POST',
      body: { target_member_id: targetId },
    });
  };

  // Back from the provider: finish what the person was doing.
  React.useEffect(() => {
    if (!initialNotice) return;
    clearOAuthNoticeFromUrl();
    const waiting = takePendingReauth();
    if (initialNotice !== 'reauthenticated' || !waiting) return;
    // A microtask: the action sets state, which an effect body must not do synchronously.
    if (waiting.kind === 'remove_member' && waiting.workspace_id === workspaceId) {
      queueMicrotask(
        () =>
          void run(removeAction(waiting.member_id), {
            success: t('member_removed', { name: waiting.label }),
          }),
      );
    } else if (waiting.kind === 'transfer_ownership' && waiting.workspace_id === workspaceId) {
      queueMicrotask(
        () =>
          void run(transferAction(waiting.target_member_id), {
            success: t('pending_transfer', { name: waiting.label }),
          }),
      );
    }
    // The effect is the one-shot reaction to the page load; it must not re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remove = (member: MemberView) =>
    setConfirmation({
      title: t('remove_title'),
      body: t('remove_body'),
      label: t('remove'),
      action: removeAction(member.id),
      success: t('member_removed', { name: member.display_name }),
      resume: {
        kind: 'remove_member',
        workspace_id: workspaceId,
        member_id: member.id,
        label: member.display_name,
      },
    });

  const admins = members.filter((m) => m.role === 'admin');
  const columns = manager ? MANAGER_COLUMNS : LIMITED_COLUMNS;

  function scopeText(member: MemberView): string {
    if (member.role !== 'member') return '';
    return member.specialist_scope === 'selected'
      ? t('scope_count', { count: member.specialist_slugs?.length ?? 0 })
      : t('all');
  }

  return (
    <section className="space-y-8">
      <SettingsPageHeader
        title={t('title')}
        description={t('description')}
        actions={
          manager ? (
            <SNButton
              variant="primary"
              onClick={() => {
                setEditor('invite');
                setError(null);
              }}
            >
              {t('invite')}
            </SNButton>
          ) : null
        }
      />
      {error && editor === null && !confirmation && !transferOpen && !reauth ? (
        <SNBanner tone="danger" onDismiss={() => setError(null)} dismissLabel={t('dismiss')}>
          {error}
        </SNBanner>
      ) : null}
      {created ? (
        <div className="space-y-3 rounded-md border border-border p-4">
          {created.email_sent ? (
            <SNBanner tone="success">{t('invite_sent', { email: created.invitation.email })}</SNBanner>
          ) : (
            <SNBanner tone="warning">{t('email_failed')}</SNBanner>
          )}
          <SNField label={t('copy')}>
            <div className="flex items-center gap-2">
              <SNInput readOnly value={created.invite_url} onFocus={(e) => e.target.select()} />
              <SNIconButton
                label={t('copy_link')}
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(created.invite_url)
                    .then(() => snToast.success(t('link_copied')))
                    .catch(() => setError(t('copy_failed')));
                }}
              >
                <Copy aria-hidden="true" />
              </SNIconButton>
            </div>
          </SNField>
        </div>
      ) : null}
      {members.length === 0 ? (
        <PresetEmptyState preset="members_list" className="rounded-md border border-dashed border-border py-6" />
      ) : null}
      <div className="overflow-hidden rounded-md border border-border" hidden={members.length === 0}>
        <div
          aria-hidden="true"
          className={`hidden gap-4 border-b border-border bg-canvas-alt px-4 py-2 text-xs font-medium text-text-secondary md:grid ${columns}`}
        >
          <span>{t('col_name')}</span>
          <span>{t('col_role')}</span>
          {manager ? <span>{t('col_access')}</span> : null}
          {manager ? <span>{t('col_last_active')}</span> : null}
          {manager ? <span className="text-end">{t('col_actions')}</span> : null}
        </div>
        <ul className="divide-y divide-border">
          {members.map((member) => {
            const canManage =
              manager &&
              member.role !== 'owner' &&
              !member.is_you &&
              (role === 'owner' || member.role !== 'admin');
            return (
              <li
                key={member.id}
                className={`relative grid cursor-pointer items-center gap-x-4 gap-y-2 p-4 hover:bg-(--state-hover) ${columns}`}
                onClick={() => {
                  setEditor(member);
                  setError(null);
                }}
              >
                <div className="min-w-0 max-md:pe-20">
                  <p className="break-words font-medium">
                    {member.display_name}
                    {member.is_you ? (
                      <span className="ms-2 text-sm text-text-secondary">{t('you')}</span>
                    ) : null}
                  </p>
                  {member.email ? (
                    <p className="break-all text-sm text-text-secondary">{member.email}</p>
                  ) : null}
                </div>
                <div>
                  <SNBadge
                    tone={
                      member.role === 'owner' ? 'brand' : member.role === 'admin' ? 'review' : 'neutral'
                    }
                  >
                    {t(roleKeys[member.role])}
                  </SNBadge>
                </div>
                {manager ? (
                  <p className="text-sm text-text-secondary">{scopeText(member)}</p>
                ) : null}
                {manager ? (
                  <p className="text-sm text-text-secondary">
                    {member.last_active_at
                      ? formatRelativeTime(member.last_active_at, locale)
                      : t('never_active')}
                  </p>
                ) : null}
                {manager ? (
                  <div
                    className="flex justify-end gap-1 max-md:absolute max-md:end-3 max-md:top-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {canManage ? (
                      <>
                        <SNIconButton
                          size="sm"
                          label={t('edit_member', { name: member.display_name })}
                          tooltip={t('edit')}
                          onClick={() => {
                            setEditor(member);
                            setError(null);
                          }}
                        >
                          <Pencil aria-hidden="true" />
                        </SNIconButton>
                        <SNIconButton
                          size="sm"
                          variant="danger"
                          label={t('remove_member', { name: member.display_name })}
                          tooltip={t('remove')}
                          onClick={() => remove(member)}
                        >
                          <Trash2 aria-hidden="true" />
                        </SNIconButton>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
      {manager ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t('invitations')}</h2>
          {invitations.length === 0 ? (
            <PresetEmptyState preset="members_invitations" className="rounded-md border border-dashed border-border py-6" />
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {invitations.map((invitation) => (
                <li
                  key={invitation.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-4"
                >
                  <div className="min-w-0">
                    <p className="break-all">{invitation.email}</p>
                    <p className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
                      <span>{t(roleKeys[invitation.role])}</span>
                      {invitation.state === 'expired' ? (
                        <SNBadge tone="warning">{t('expired_label')}</SNBadge>
                      ) : (
                        <span>{t('expires', { date: formatDate(invitation.expires_at, locale) })}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <SNButton
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        run(
                          async () => {
                            setCreated(
                              await apiRequest<InvitationCreatedView>(
                                `${base}/invitations/${invitation.id}/resend`,
                                { method: 'POST' },
                              ),
                            );
                          },
                          { success: t('resent', { email: invitation.email }) },
                        )
                      }
                    >
                      {t('resend')}
                    </SNButton>
                    <SNButton
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        setConfirmation({
                          title: t('revoke_title'),
                          body: t('revoke_body', { email: invitation.email }),
                          label: t('revoke'),
                          success: t('revoked'),
                          action: async () => {
                            await apiRequest(`${base}/invitations/${invitation.id}`, {
                              method: 'DELETE',
                            });
                          },
                        })
                      }
                    >
                      {t('revoke')}
                    </SNButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
      {role === 'owner' ? (
        <section className="space-y-3 border-t border-border pt-6">
          <h2 className="text-lg font-semibold">{t('transfer')}</h2>
          {transfer ? (
            <>
              <p className="text-sm text-text-secondary">
                {t('pending_transfer', { name: transfer.target.display_name })}
              </p>
              <SNButton
                disabled={pending}
                onClick={() =>
                  run(
                    async () => {
                      await apiRequest(`${base}/transfer-ownership`, { method: 'DELETE' });
                    },
                    { success: t('transfer_cancelled') },
                  )
                }
              >
                {t('cancel_transfer')}
              </SNButton>
            </>
          ) : (
            <SNButton onClick={() => setTransferOpen(true)}>{t('transfer')}</SNButton>
          )}
        </section>
      ) : (
        <SNButton
          variant="danger"
          disabled={pending}
          onClick={() =>
            setConfirmation({
              title: t('leave_title'),
              body: t('leave_body'),
              label: t('leave'),
              success: t('left'),
              action: async () => {
                await apiRequest(`${base}/members/me`, { method: 'DELETE' });
                router.replace('/');
              },
            })
          }
        >
          {t('leave')}
        </SNButton>
      )}
      {editor === 'invite' ? (
        <InviteDialog
          actorRole={role}
          specialists={specialists}
          pending={pending}
          error={error}
          onClose={() => {
            if (!pending) setEditor(null);
          }}
          onSave={(body) =>
            run(
              async () => {
                setCreated(
                  await apiRequest<InvitationCreatedView>(`${base}/invitations`, {
                    method: 'POST',
                    body,
                  }),
                );
                setEditor(null);
              },
              { success: t('invite_created') },
            )
          }
        />
      ) : editor ? (
        <MemberDetailDrawer
          key={editor.id}
          member={editor}
          actorRole={role}
          specialists={specialists}
          pending={pending}
          error={error}
          onClose={() => {
            if (!pending) setEditor(null);
          }}
          onRemove={() => {
            setEditor(null);
            remove(editor);
          }}
          onSave={(body) =>
            run(
              async () => {
                await apiRequest(`${base}/members/${editor.id}`, { method: 'PATCH', body });
                setEditor(null);
              },
              { success: t('changes_saved') },
            )
          }
        />
      ) : null}
      <SNConfirmDialog
        error={error}
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setConfirmation(null);
        }}
        title={confirmation?.title ?? t('confirm')}
        description={confirmation?.body ?? ''}
        confirmLabel={confirmation?.label ?? t('confirm')}
        cancelLabel={t('cancel')}
        destructive
        pending={pending}
        onConfirm={() => {
          if (confirmation) {
            void run(confirmation.action, {
              success: confirmation.success,
              resume: confirmation.resume,
            });
          }
        }}
      />
      <SNDialog
        open={transferOpen}
        onOpenChange={(open) => {
          if (!pending) setTransferOpen(open);
        }}
        title={t('transfer_title')}
        description={t('transfer_body')}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const chosen = admins.find((m) => m.id === target);
            void run(
              async () => {
                await transferAction(target)();
                setTransferOpen(false);
              },
              {
                success: t('pending_transfer', { name: chosen?.display_name ?? '' }),
                resume: {
                  kind: 'transfer_ownership',
                  workspace_id: workspaceId,
                  target_member_id: target,
                  label: chosen?.display_name ?? '',
                },
              },
            );
          }}
        >
          {admins.length === 0 ? <SNBanner tone="info">{t('transfer_needs_admin')}</SNBanner> : null}
          <SNField label={t('target')} required>
            <SNSelect
              value={target}
              onValueChange={setTarget}
              disabled={admins.length === 0}
              options={admins.map((m) => ({ value: m.id, label: m.display_name }))}
            />
          </SNField>
          {error ? <SNBanner tone="danger">{error}</SNBanner> : null}
          <div className="flex justify-end gap-2">
            <SNButton type="button" disabled={pending} onClick={() => setTransferOpen(false)}>
              {t('cancel')}
            </SNButton>
            <SNButton type="submit" variant="primary" disabled={!target} loading={pending}>
              {t('send_transfer')}
            </SNButton>
          </div>
        </form>
      </SNDialog>
      <ReauthDialog
        open={reauth}
        onOpenChange={(open) => {
          setReauth(open);
          if (!open) retry.current = null;
        }}
        methods={reauthMethods}
        onPassword={confirmWithPassword}
        onOAuthStart={leaveForProvider}
      />
    </section>
  );
}

function InviteDialog({
  actorRole,
  specialists,
  pending,
  error,
  onSave,
  onClose,
}: {
  actorRole: MemberRole;
  specialists: ShellSpecialistView[];
  pending: boolean;
  error: string | null;
  onSave: (body: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const t = useTranslations('members');
  const [role, setRole] = React.useState<MemberRole>('member');
  const [scope, setScope] = React.useState<'all' | 'selected'>('all');
  const [slugs, setSlugs] = React.useState<string[]>([]);
  const roleOptions = (
    actorRole === 'owner'
      ? ['admin', 'member', 'viewer']
      : ['member', 'viewer']
  ) as Array<Exclude<MemberRole, 'owner'>>;

  return (
    <SNDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t('invite')}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          onSave({
            email: form.get('email'),
            role,
            ...(role === 'member'
              ? {
                  specialist_scope: scope,
                  ...(scope === 'selected' ? { specialist_slugs: slugs } : {}),
                }
              : {}),
          });
        }}
      >
        <SNField label={t('email')} required>
          <SNInput name="email" type="email" autoComplete="email" required />
        </SNField>
        <SNField label={t('role')}>
          <SNSelect
            value={role}
            onValueChange={(v) => setRole(v as MemberRole)}
            disabled={pending}
            options={roleOptions.map((value) => ({ value, label: t(roleKeys[value]) }))}
          />
        </SNField>
        {role === 'member' ? (
          <>
            <SNField label={t('scope')}>
              <SNSelect
                value={scope}
                onValueChange={(v) => setScope(v as 'all' | 'selected')}
                options={[
                  { value: 'all', label: t('all') },
                  { value: 'selected', label: t('selected') },
                ]}
              />
            </SNField>
            {scope === 'selected' ? (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">{t('selected')}</legend>
                {specialists.map((s) => (
                  <SNCheckbox
                    key={s.agent_slug}
                    label={s.display_name}
                    checked={slugs.includes(s.agent_slug)}
                    onCheckedChange={(checked) =>
                      setSlugs(
                        checked
                          ? [...slugs, s.agent_slug]
                          : slugs.filter((slug) => slug !== s.agent_slug),
                      )
                    }
                  />
                ))}
              </fieldset>
            ) : null}
          </>
        ) : null}
        {error ? <SNBanner tone="danger">{error}</SNBanner> : null}
        <div className="flex gap-2">
          <SNButton
            type="submit"
            variant="primary"
            loading={pending}
            disabled={role === 'member' && scope === 'selected' && slugs.length === 0}
          >
            {t('invite')}
          </SNButton>
          <SNButton disabled={pending} onClick={onClose}>
            {t('cancel')}
          </SNButton>
        </div>
      </form>
    </SNDialog>
  );
}

function MemberDetailDrawer({
  member,
  actorRole,
  specialists,
  pending,
  error,
  onSave,
  onRemove,
  onClose,
}: {
  member: MemberView;
  actorRole: MemberRole;
  specialists: ShellSpecialistView[];
  pending: boolean;
  error: string | null;
  onSave: (body: Record<string, unknown>) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('members');
  const [role, setRole] = React.useState(member.role);
  const [scope, setScope] = React.useState(member.specialist_scope ?? 'all');
  const [slugs, setSlugs] = React.useState(member.specialist_slugs ?? []);
  const canEdit =
    (actorRole === 'owner' || actorRole === 'admin') &&
    member.role !== 'owner' &&
    !member.is_you &&
    (actorRole === 'owner' || member.role !== 'admin');

  const roleOptions = (
    actorRole === 'owner'
      ? ['admin', 'member', 'viewer']
      : member.role === 'admin'
        ? ['admin']
        : ['member', 'viewer']
  ) as Array<Exclude<MemberRole, 'owner'>>;

  return (
    <SNDrawer
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={member.display_name}
      showTitle
      side="end"
      width="panel"
      closeLabel={t('cancel')}
    >
      <div className="space-y-6 p-6">
        <div className="space-y-2 border-b border-border pb-4">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold">{member.display_name}</span>
            {member.is_you ? (
              <span className="text-xs text-text-secondary">({t('you')})</span>
            ) : null}
          </div>
          {member.email ? (
            <p className="break-all text-sm text-text-secondary">{member.email}</p>
          ) : null}
          <div className="flex items-center gap-2 pt-1">
            <SNBadge
              tone={
                member.role === 'owner'
                  ? 'brand'
                  : member.role === 'admin'
                    ? 'review'
                    : 'neutral'
              }
            >
              {t(roleKeys[member.role])}
            </SNBadge>
          </div>
        </div>

        {canEdit ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              onSave({
                ...(role !== member.role ? { role } : {}),
                ...(role === 'member'
                  ? {
                      specialist_scope: scope,
                      ...(scope === 'selected' ? { specialist_slugs: slugs } : {}),
                    }
                  : {}),
              });
            }}
          >
            <SNField label={t('role')}>
              <SNSelect
                value={role}
                onValueChange={(v) => setRole(v as MemberRole)}
                disabled={pending || (actorRole === 'admin' && member.role === 'admin')}
                options={roleOptions.map((value) => ({ value, label: t(roleKeys[value]) }))}
              />
            </SNField>
            {role === 'member' ? (
              <>
                <SNField label={t('scope')}>
                  <SNSelect
                    value={scope}
                    onValueChange={(v) => setScope(v as 'all' | 'selected')}
                    options={[
                      { value: 'all', label: t('all') },
                      { value: 'selected', label: t('selected') },
                    ]}
                  />
                </SNField>
                {scope === 'selected' ? (
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium">{t('selected')}</legend>
                    {specialists.map((s) => (
                      <SNCheckbox
                        key={s.agent_slug}
                        label={s.display_name}
                        checked={slugs.includes(s.agent_slug)}
                        onCheckedChange={(checked) =>
                          setSlugs(
                            checked
                              ? [...slugs, s.agent_slug]
                              : slugs.filter((slug) => slug !== s.agent_slug),
                          )
                        }
                      />
                    ))}
                  </fieldset>
                ) : null}
              </>
            ) : null}
            {error ? <SNBanner tone="danger">{error}</SNBanner> : null}
            <div className="flex flex-col gap-2 pt-4">
              <SNButton
                type="submit"
                variant="primary"
                loading={pending}
                disabled={
                  (role === 'member' && scope === 'selected' && slugs.length === 0) ||
                  (role === member.role && role !== 'member')
                }
              >
                {t('save')}
              </SNButton>
              {actorRole === 'owner' || member.role !== 'admin' ? (
                <SNButton
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={onRemove}
                  className="text-danger hover:text-danger"
                >
                  {t('remove')}
                </SNButton>
              ) : null}
              <SNButton type="button" disabled={pending} onClick={onClose}>
                {t('cancel')}
              </SNButton>
            </div>
          </form>
        ) : (
          <div className="space-y-4 text-sm text-text-secondary">
            <div>
              <span className="font-medium text-text">{t('role')}</span>: {t(roleKeys[member.role])}
            </div>
            {member.role === 'member' ? (
              <div>
                <span className="font-medium text-text">{t('scope')}</span>:{' '}
                {member.specialist_scope === 'selected' ? t('selected') : t('all')}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </SNDrawer>
  );
}
