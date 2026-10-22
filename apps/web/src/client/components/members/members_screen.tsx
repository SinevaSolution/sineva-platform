'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  SNBanner,
  SNButton,
  SNCheckbox,
  SNConfirmDialog,
  SNDialog,
  SNField,
  SNInput,
  SNSelect,
} from '@sineva/ui';
import { formatDate } from '@sineva/ui/format';
import { ApiError, apiRequest } from '@/client/lib/api';
import { useApiErrorText } from '@/client/lib/use_api_error';
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
    <section className="mx-auto w-full max-w-4xl space-y-8 p-5 sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="mt-2 text-sm text-text-secondary">{t('description')}</p>
        </div>
        {manager ? (
          <SNButton
            variant="primary"
            onClick={() => {
              setEditor('invite');
              setError(null);
            }}
          >
            {t('invite')}
          </SNButton>
        ) : null}
      </header>
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
      <ul className="divide-y divide-border rounded-md border border-border">
        {members.map((member) => (
          <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
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
              <div className="flex flex-wrap gap-2">
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
            <p className="text-sm text-text-secondary">{t('empty_invites')}</p>
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
      {editor ? (
        <MemberEditor
          key={typeof editor === 'string' ? editor : editor.id}
          member={editor === 'invite' ? null : editor}
          actorRole={role}
          specialists={specialists}
          pending={pending}
          error={error}
          onClose={() => {
            if (!pending) setEditor(null);
          }}
          onSave={(body) =>
            run(async () => {
              if (editor === 'invite')
                setCreated(
                  await apiRequest<InvitationCreatedView>(`${base}/invitations`, {
                    method: 'POST',
                    body,
                  }),
                );
              else await apiRequest(`${base}/members/${editor.id}`, { method: 'PATCH', body });
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
function MemberEditor({
  member,
  actorRole,
  specialists,
  pending,
  error,
  onSave,
  onClose,
}: {
  member: MemberView | null;
  actorRole: MemberRole;
  specialists: ShellSpecialistView[];
  pending: boolean;
  error: string | null;
  onSave: (body: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const t = useTranslations('members');
  const [role, setRole] = React.useState(member?.role ?? 'member');
  const [scope, setScope] = React.useState(member?.specialist_scope ?? 'all');
  const [slugs, setSlugs] = React.useState(member?.specialist_slugs ?? []);
  const roleOptions = (
    actorRole === 'owner'
      ? ['admin', 'member', 'viewer']
      : member?.role === 'admin'
        ? ['admin']
        : ['member', 'viewer']
  ) as Array<Exclude<MemberRole, 'owner'>>;
  return (
    <SNDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={member ? t('edit') : t('invite')}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          onSave({
            ...(!member ? { email: form.get('email') } : {}),
            ...(role !== member?.role ? { role } : {}),
            ...(role === 'member'
              ? {
                  specialist_scope: scope,
                  ...(scope === 'selected' ? { specialist_slugs: slugs } : {}),
                }
              : {}),
          });
        }}
      >
        {!member ? (
          <SNField label={t('email')} required>
            <SNInput name="email" type="email" autoComplete="email" required />
          </SNField>
        ) : null}
        <SNField label={t('role')}>
          <SNSelect
            value={role}
            onValueChange={(v) => setRole(v as MemberRole)}
            disabled={pending || (actorRole === 'admin' && member?.role === 'admin')}
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
              <fieldset>
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
            disabled={
              (role === 'member' && scope === 'selected' && slugs.length === 0) ||
              (!!member && role === member.role && role !== 'member')
            }
          >
            {member ? t('save') : t('invite')}
          </SNButton>
          <SNButton disabled={pending} onClick={onClose}>
            {t('cancel')}
          </SNButton>
        </div>
      </form>
    </SNDialog>
  );
}
