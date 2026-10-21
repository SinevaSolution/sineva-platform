import type {
  AccountEntity,
  AccountRepository,
} from '@/server/domain/repositories/account_repository';

export interface LinkedAccountDto {
  id: string;
  provider: string;
  provider_email: string | null;
  provider_username: string | null;
  created_at: string;
}

export class ListUserAccountsUseCase {
  constructor(private readonly accountRepo: AccountRepository) {}

  async execute(userId: string): Promise<LinkedAccountDto[]> {
    const accounts: AccountEntity[] = await this.accountRepo.findByUserId(userId);

    return accounts.map((a) => ({
      id: a.id,
      provider: a.provider_id,
      provider_email: a.provider_email ?? null,
      provider_username: a.provider_username ?? null,
      created_at: a.created_at,
    }));
  }
}
