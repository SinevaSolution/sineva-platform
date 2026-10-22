import 'server-only';
import type { PrismaClient } from '@/server/infrastructure/database/generated/client';
import type {
  AccountEntity,
  AccountRepository,
} from '@/server/domain/repositories/account_repository';

function mapAccount(row: {
  id: string;
  user_id: string;
  provider_id: string;
  account_id: string;
  provider_email: string | null;
  provider_username: string | null;
  created_at: Date;
}): AccountEntity {
  return {
    id: row.id,
    user_id: row.user_id,
    provider_id: row.provider_id,
    account_id: row.account_id,
    provider_email: row.provider_email,
    provider_username: row.provider_username,
    created_at: row.created_at.toISOString(),
  };
}

export class PrismaAccountRepository implements AccountRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByProviderAndAccountId(
    providerId: string,
    accountId: string,
  ): Promise<{ account: AccountEntity; user: { id: string; status: string } } | null> {
    const row = await this.prisma.account.findUnique({
      where: {
        provider_id_account_id: {
          provider_id: providerId,
          account_id: accountId,
        },
      },
      include: {
        user: {
          select: { id: true, status: true },
        },
      },
    });

    if (!row) return null;

    return {
      account: mapAccount(row),
      user: row.user,
    };
  }

  async findByUserId(userId: string): Promise<AccountEntity[]> {
    const rows = await this.prisma.account.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'asc' },
    });
    return rows.map(mapAccount);
  }

  async create(data: {
    user_id: string;
    provider_id: string;
    account_id: string;
    provider_email?: string | null;
    provider_username?: string | null;
  }): Promise<AccountEntity> {
    const row = await this.prisma.account.create({
      data: {
        user_id: data.user_id,
        provider_id: data.provider_id,
        account_id: data.account_id,
        provider_email: data.provider_email ?? null,
        provider_username: data.provider_username ?? null,
      },
    });
    return mapAccount(row);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.account.delete({
      where: { id },
    });
  }
}
