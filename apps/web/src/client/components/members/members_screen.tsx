'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  SNBadge,
  SNBanner,
  SNButton,
  SNCheckbox,
  SNConfirmDialog,
  SNDialog,
  SNDrawer,
  SNField,
  SNInput,
  SNSelect,
} from '@sineva/ui';
import { formatDate } from '@sineva/ui/format';
import { PresetEmptyState } from '@/client/components/ui/empty_state';
import { ApiError, apiRequest } from '@/client/lib/api';
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

const roleKeys = {
  owner: 'roles.owner',
  admin: 'roles.admin',
  member: 'roles.member',
  viewer: 'roles.viewer',
} as const;

type Action = () => Promise<void>;

export function MembersScreen({
  workspaceId,
  role,
  members,
  invitations,
  transfer,
  specialists,
}: {
  workspaceId: string;
  role: MemberRole;
  members: MemberView[];
  invitations: InvitationView[];
  transfer: OwnershipTransferView | null;
  specialists: ShellSpecialistView[];
}) {
  const t = useTranslations('members');
  const locale = useLocale();
  const errorText = useApiErrorText();
  const router = useRouter();
  const base = `/api/v1/workspaces/${workspaceId}`;
  const manager = role === 'owner' || role === 'admin';
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [editor, setEditor] = React.useState<MemberView | 'invite' | null>(null);
  const [created, setCreated] = React.useState<InvitationCreatedView | null>(null);
  const [confirmation, setConfirmation] = React.useState<{
    title: string;
    body: string;
    label: string;
    action: Action;
  } | null>(null);
  const [transferOpen, setTransferOpen] = React.useState(false);
  const [target, setTarget] = React.useState('');
  const [reauth, setReauth] = React.useState(false);
  const retry = React.useRef<Action | null>(null);

  async function run(action: Action, sensitive = false) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await action();
      setConfirmation(null);
      router.refresh();
    } catch (err) {
      if (sensitive && err instanceof ApiError && err.status === 403) {
        retry.current = action;
        setConfirmation(null);
        setTransferOpen(false);
        setReauth(true);
      } else setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  async function authenticate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get('password');
    await run(async () => {
      await apiRequest('/api/v1/auth/reauthenticate', { method: 'POST', body: { password } });
      await retry.current?.();
      setReauth(false);
      retry.current = null;
    });
  }

  const remove = (member: MemberView) =>
    setConfirmation({
      title: t('remove_title'),
      body: t('remove_body'),
      label: t('remove'),
      action: async () => {
        await apiRequest(`${base}/members/${member.id}`, { method: 'DELETE' });
      },
    });

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
      {error ? <SNBanner tone="danger">{error}</SNBanner> : null}
      {created ? (
        <div className="space-y-3 rounded-md border border-border p-4">
          {!created.email_sent ? <SNBanner tone="warning">{t('email_failed')}</SNBanner> : null}
          <SNField label={t('copy')}>
            <SNInput readOnly value={created.invite_url} onFocus={(e) => e.target.select()} />
          </SNField>
          <SNButton
            onClick={() =>
              run(async () => {
                await navigator.clipboard.writeText(created.invite_url);
              })
            }
          >
            {t('copy')}
          </SNButton>
        </div>
      ) : null}
      {members.length === 0 ? (
        <PresetEmptyState preset="members_list" className="rounded-md border border-dashed border-border py-6" />
      ) : null}
      <ul className="divide-y divide-border rounded-md border border-border" hidden={members.length === 0}>
        {members.map((member) => (
          <li
            key={member.id}
            className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-(--state-hover) cursor-pointer"
            onClick={() => {
              setEditor(member);
              setError(null);
            }}
          >
            <div className="min-w-0">
              <p className="break-words font-medium">
                {member.display_name}
                {member.is_you ? (
                  <span className="ms-2 text-sm text-text-secondary">{t('you')}</span>
                ) : null}
              </p>
              {member.email ? (
                <p className="break-all text-sm text-text-secondary">{member.email}</p>
              ) : null}
              <p className="text-sm text-text-secondary">{t(roleKeys[member.role])}</p>
            </div>
            {manager &&
            member.role !== 'owner' &&
            !member.is_you &&
            (role === 'owner' || member.role !== 'admin') ? (
              <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                <SNButton
                  size="sm"
                  onClick={() => {
                    setEditor(member);
                    setError(null);
                  }}
                >
                  {t('edit')}
                </SNButton>
                {role === 'owner' || member.role !== 'admin' ? (
                  <SNButton size="sm" variant="ghost" onClick={() => remove(member)}>
                    {t('remove')}
                  </SNButton>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
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
                  <div>
                    <p className="break-all">{invitation.email}</p>
                    <p className="text-sm text-text-secondary">
                      {t(roleKeys[invitation.role])} ·{' '}
                      {t('expires', { date: formatDate(invitation.expires_at, locale) })}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <SNButton
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        run(async () => {
                          setCreated(
                            await apiRequest<InvitationCreatedView>(
                              `${base}/invitations/${invitation.id}/resend`,
                              { method: 'POST' },
                            ),
                          );
                        })
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
                          title: t('revoke'),
                          body: invitation.email,
                          label: t('revoke'),
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
                  run(async () => {
                    await apiRequest(`${base}/transfer-ownership`, { method: 'DELETE' });
                  })
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
            run(async () => {
              setCreated(
                await apiRequest<InvitationCreatedView>(`${base}/invitations`, {
                  method: 'POST',
                  body,
                }),
              );
              setEditor(null);
            })
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
            run(async () => {
              await apiRequest(`${base}/members/${editor.id}`, { method: 'PATCH', body });
              setEditor(null);
            })
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
          if (confirmation) void run(confirmation.action, confirmation.label === t('remove'));
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
            void run(async () => {
              await apiRequest(`${base}/transfer-ownership`, {
                method: 'POST',
                body: { target_member_id: target },
              });
              setTransferOpen(false);
            }, true);
          }}
        >
          <SNField label={t('target')} required>
            <SNSelect
              value={target}
              onValueChange={setTarget}
              options={members
                .filter((m) => m.role === 'admin')
                .map((m) => ({ value: m.id, label: m.display_name }))}
            />
          </SNField>
          <SNButton type="submit" variant="primary" disabled={!target} loading={pending}>
            {t('send_transfer')}
          </SNButton>
          <SNButton disabled={pending} onClick={() => setTransferOpen(false)}>
            {t('cancel')}
          </SNButton>
        </form>
      </SNDialog>
      <SNDialog
        open={reauth}
        onOpenChange={(open) => {
          if (!pending) setReauth(open);
        }}
        title={t('reauth')}
        description={t('reauth_body')}
      >
        <form onSubmit={authenticate} className="space-y-4">
          <SNField label={t('password')} required>
            <SNInput type="password" name="password" autoComplete="current-password" required />
          </SNField>
          <SNButton type="submit" variant="primary" loading={pending}>
            {t('confirm')}
          </SNButton>
          <SNButton disabled={pending} onClick={() => setReauth(false)}>
            {t('cancel')}
          </SNButton>
          {error ? <SNBanner tone="danger">{error}</SNBanner> : null}
        </form>
      </SNDialog>
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
