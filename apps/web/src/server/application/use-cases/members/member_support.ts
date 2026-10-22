import type { RequestContext } from '@/server/domain/context/request_context';
import type { UserRole } from '@/server/domain/entities/user';
import type { EmailLocale, EmailSender } from '@/server/domain/email/email_sender';
import {
  DependencyUnavailableError,
  ForbiddenError,
  ValidationError,
} from '@/server/domain/errors/domain_error';
import type { InvitationEntity } from '@/server/domain/members/invitation';
import type { MemberAccount, MemberAccountLookup } from '@/server/domain/members/member_ports';
import type { MemberDirectoryEntry } from '@/server/domain/repositories/workspace_member_repository';
import type { WorkspaceRepository } from '@/server/domain/repositories/workspace_repository';
import { hasPermission } from '@/server/domain/permissions/registry';
import { scopeApplies } from '@/server/domain/members/member_policy';
import type { MemberView, InvitationView } from '@/shared/members_view';

// Helpers shared by the member use cases. Not a use case itself: it holds the
// few rules that two or more of them must apply identically (slug validation,
// the invitation email, how a person's name is shown).

export function requireWorkspaceId(context: RequestContext): string {
  if (!context.workspace_id) {
    // The route guard always sets it; reaching here is a wiring error.
    throw new ForbiddenError('A workspace is required for this action');
  }
  return context.workspace_id;
}

export function requireActorRole(context: RequestContext): UserRole {
  if (!context.role) {
    throw new ForbiddenError('Membership is required for this action');
  }
  return context.role;
}

export function displayName(account: Pick<MemberAccount, 'full_name' | 'preferred_name'>): string {
  return account.preferred_name?.trim() || account.full_name.trim();
}

export function firstName(account: Pick<MemberAccount, 'full_name' | 'preferred_name'>): string {
  return displayName(account).split(/\s+/)[0] ?? '';
}

export function emailLocale(locale: string | undefined): EmailLocale {
  return locale === 'en' ? 'en' : 'id';
}

/**
 * Validates an allowlist against the static manifest slugs (the platform's
 * view of which specialists exist) and removes duplicates. An empty list is
 * rejected for `selected`: a member with no specialist at all is a mistake the
 * UI should surface, not a state to store.
 */
export function normalizeAllowlist(slugs: readonly string[], known: readonly string[]): string[] {
  const unique = [...new Set(slugs.map((slug) => slug.trim()))];
  if (unique.length === 0) {
    throw new ValidationError('Pick at least one specialist', [
      { code: 'allowlist_required', field: 'specialist_slugs', detail: 'A selected scope needs at least one specialist' },
    ]);
  }
  const unknown = unique.filter((slug) => !known.includes(slug));
  if (unknown.length > 0) {
    throw new ValidationError('Unknown specialist', [
      { code: 'unknown_specialist', field: 'specialist_slugs', detail: `Not a specialist: ${unknown.join(', ')}` },
    ]);
  }
  return unique;
}

export function scopeNotApplicable(role: UserRole): ValidationError {
  return new ValidationError('Specialist access applies to members only', [
    {
      code: 'scope_not_applicable',
      field: 'specialist_scope',
      detail: `Role ${role} has no per-specialist scope`,
    },
  ]);
}

/** Scope and allowlist an invitation or member ends up with for a role. */
export function resolveAccess(
  role: UserRole,
  scope: 'all' | 'selected' | undefined,
  slugs: readonly string[] | undefined,
  known: readonly string[],
): { specialist_scope: 'all' | 'selected'; specialist_slugs: string[] } {
  if (scope === 'selected') {
    if (!scopeApplies(role)) throw scopeNotApplicable(role);
    return { specialist_scope: 'selected', specialist_slugs: normalizeAllowlist(slugs ?? [], known) };
  }
  return { specialist_scope: 'all', specialist_slugs: [] };
}

export function canViewContact(role: UserRole): boolean {
  return hasPermission(role, 'member.view_contact').allowed;
}

export function toMemberView(
  entry: MemberDirectoryEntry,
  viewerUserId: string,
  withContact: boolean,
): MemberView {
  const { member, user } = entry;
  const view: MemberView = {
    id: member.id,
    display_name: displayName(user),
    avatar_url: user.avatar_url,
    role: member.role,
    job_title: member.job_title,
    department: member.department,
    status: 'active',
    is_you: member.user_id === viewerUserId,
    joined_at: member.created_at,
  };
  if (!withContact) {
    return view;
  }
  return {
    ...view,
    email: user.email,
    phone_number: user.phone_number,
    last_active_at: user.last_active_at,
    specialist_scope: member.specialist_scope,
    specialist_slugs: entry.specialist_slugs,
  };
}

export function toInvitationView(invitation: InvitationEntity, state: 'pending' | 'expired'): InvitationView {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role as InvitationView['role'],
    specialist_scope: invitation.specialist_scope,
    specialist_slugs: invitation.specialist_slugs,
    state,
    expires_at: invitation.expires_at,
    last_sent_at: invitation.last_sent_at,
    created_at: invitation.created_at,
  };
}

export interface InvitationMailDeps {
  email: EmailSender;
  workspaces: Pick<WorkspaceRepository, 'findById'>;
  accounts: MemberAccountLookup;
  appUrl: string;
}

export function inviteUrl(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/$/, '')}/invite/${token}`;
}

/**
 * Sends the invitation email. A transport failure is reported as `false`
 * instead of throwing: the invitation row is already committed and its link
 * can still be copied, so failing the whole call would leave the inviter with
 * an error and a live link they cannot see. The caller returns the flag so the
 * UI says so honestly.
 */
export async function sendInvitationEmail(
  deps: InvitationMailDeps,
  invitation: InvitationEntity,
  token: string,
): Promise<boolean> {
  const [workspace, inviter] = await Promise.all([
    deps.workspaces.findById(invitation.workspace_id),
    deps.accounts.findById(invitation.inviter_user_id),
  ]);
  try {
    await deps.email.send({
      to: invitation.email,
      template: 'workspace_invitation',
      // The invitee's language is unknown before they have an account, so the
      // workspace default is the best available signal.
      locale: emailLocale(workspace?.default_locale),
      params: {
        url: inviteUrl(deps.appUrl, token),
        workspace_name: workspace?.workspace_name ?? '',
        inviter_name: inviter ? displayName(inviter) : '',
        role: invitation.role,
        expires_in_days: 7,
      },
    });
    return true;
  } catch (error) {
    if (error instanceof DependencyUnavailableError) {
      return false;
    }
    throw error;
  }
}
