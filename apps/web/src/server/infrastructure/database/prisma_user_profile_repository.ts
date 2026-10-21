import 'server-only';
import type { PrismaClient } from '@/server/infrastructure/database/generated/client';
import type { UserProfileEntity } from '@/server/domain/entities/user_profile';
import { NotFoundError } from '@/server/domain/errors/domain_error';
import type {
  UpdateUserProfileInput,
  UserProfileRepository,
} from '@/server/domain/repositories/user_profile_repository';

const PROFILE_SELECT = {
  id: true,
  email: true,
  email_verified: true,
  full_name: true,
  avatar_url: true,
  locale: true,
  timezone: true,
  created_at: true,
} as const;

function mapProfile(row: {
  id: string;
  email: string;
  email_verified: boolean;
  full_name: string;
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
    avatar_url: row.avatar_url,
    locale: row.locale,
    timezone: row.timezone,
    created_at: row.created_at.toISOString(),
  };
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
    try {
      const row = await this.prisma.user.update({
        where: { id: userId },
        data: input,
        select: PROFILE_SELECT,
      });
      return mapProfile(row);
    } catch (err) {
      // P2025: record to update not found.
      if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2025') {
        throw new NotFoundError('User', userId);
      }
      throw err;
    }
  }
}
