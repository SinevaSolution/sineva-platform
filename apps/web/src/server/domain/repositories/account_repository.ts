export interface AccountEntity {
  id: string;
  user_id: string;
  provider_id: string;
  account_id: string;
  provider_email?: string | null;
  provider_username?: string | null;
  created_at: string;
}

export interface AccountRepository {
  findByProviderAndAccountId(
    providerId: string,
    accountId: string,
  ): Promise<{ account: AccountEntity; user: { id: string; status: string } } | null>;
  findByUserId(userId: string): Promise<AccountEntity[]>;
  create(data: {
    user_id: string;
    provider_id: string;
    account_id: string;
    provider_email?: string | null;
    provider_username?: string | null;
  }): Promise<AccountEntity>;
  delete(id: string): Promise<void>;
}
