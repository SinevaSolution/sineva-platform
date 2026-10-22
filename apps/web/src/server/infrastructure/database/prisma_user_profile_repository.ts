import 'server-only';
import type { PrismaClient } from '@/server/infrastructure/database/generated/client';
import {
  DEPARTMENTS,
  SALUTATIONS,
  type DepartmentValue,
  type SalutationValue,
  type UserMembershipSummary,
  type UserProfileEntity,
} from '@/server/domain/entities/user_profile';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import { avatarUrlForKey } from '@/server/domain/profile/avatar';
import type {
  UpdateUserProfileInput,
  UserProfileRepository,
} from '@/server/domain/repositories/user_profile_repository';

const PROFILE_SELECT = {
  id: true,
  email: true,
  email_verified: true,
  full_name: true,
  preferred_name: true,
  salutation: true,
  phone_number: true,
  phone_verified_at: true,
  about_me: true,
  use_profile_in_context: true,
  avatar_url: true,
  locale: true,
  timezone: true,
  created_at: true,
} as const;

// Enum-like columns are plain strings (prisma/AGENTS.md), so the adapter is
// where an unexpected stored value is neutralised instead of leaking to the UI.
function asSalutation(value: string | null): SalutationValue | null {
  return (SALUTATIONS as readonly string[]).includes(value ?? '') ? (value as SalutationValue) : null;
}

function asDepartment(value: string | null): DepartmentValue | null {
  return (DEPARTMENTS as readonly string[]).includes(value ?? '') ? (value as DepartmentValue) : null;
}

function mapProfile(row: {
  id: string;
  email: string;
  email_verified: boolean;
  full_name: string;
  preferred_name: string | null;
  salutation: string | null;
  phone_number: string | null;
  phone_verified_at: Date | null;
  about_me: string | null;
  use_profile_in_context: boolean;
  avatar_url: string | null;
  locale: string;
  timezone: string;
  created_at: Date;
}): UserProfileEntity {
  return {
    id: row.id,
    email: row.email,
    email_verified: row.email_verified,
    full_name: row.full_name,
    preferred_name: row.preferred_name,
    salutation: asSalutation(row.salutation),
    phone_number: row.phone_number,
    phone_verified: row.phone_verified_at !== null,
    about_me: row.about_me,
    use_profile_in_context: row.use_profile_in_context,
    avatar_url: avatarUrlForKey(row.avatar_url),
    locale: row.locale,
    timezone: row.timezone,
    created_at: row.created_at.toISOString(),
  };
}

function isNotFound(err: unknown): boolean {
  // P2025: record to update not found.
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2025';
}

export class PrismaUserProfileRepository implements UserProfileRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(userId: string): Promise<UserProfileEntity | null> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: PROFILE_SELECT,
    });
    return row ? mapProfile(row) : null;
  }

  async update(userId: string, input: UpdateUserProfileInput): Promise<UserProfileEntity> {
    const { reset_phone_verification, ...fields } = input;
    try {
      const row = await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...fields,
          ...(reset_phone_verification ? { phone_verified_at: null } : {}),
        },
        select: PROFILE_SELECT,
      });
      return mapProfile(row);
    } catch (err) {
      if (isNotFound(err)) {
        throw new NotFoundError('User', userId);
      }
      throw err;
    }
  }

  async listMemberships(userId: string): Promise<UserMembershipSummary[]> {
    const rows = await this.prisma.workspaceMember.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'asc' },
      select: {
        workspace_id: true,
        role: true,
        job_title: true,
        department: true,
        workspace: { select: { workspace_slug: true, workspace_name: true } },
      },
    });
    return rows.map((row) => ({
      workspace_id: row.workspace_id,
      workspace_slug: row.workspace.workspace_slug,
      workspace_name: row.workspace.workspace_name,
      role: row.role,
      job_title: row.job_title,
      department: asDepartment(row.department),
    }));
  }

  async findAvatarKey(userId: string): Promise<string | null> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatar_url: true },
    });
    return row?.avatar_url ?? null;
  }

  async setAvatarKey(userId: string, key: string | null): Promise<void> {
    try {
      await this.prisma.user.update({ where: { id: userId }, data: { avatar_url: key } });
    } catch (err) {
      if (isNotFound(err)) {
        throw new NotFoundError('User', userId);
      }
      throw err;
    }
  }
}
