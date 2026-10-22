import 'server-only';
import { getListUserAccountsUseCase, isOAuthProviderConfigured } from '@/server/container';
import type { PageSession } from '@/server/http/page_session';
import { OAUTH_PROVIDER_IDS, type SignInMethodsView } from '@/shared/sign_in_methods_view';

/** How the signed-in person can sign in and re-confirm, for the settings pages. */
export async function loadSignInMethods(session: PageSession): Promise<SignInMethodsView> {
  const accounts = await getListUserAccountsUseCase().execute(session.user_id);
  return {
    email: session.email,
    accounts: accounts.map((a) => ({
      provider: a.provider,
      provider_email: a.provider_email,
      provider_username: a.provider_username,
    })),
    configured: OAUTH_PROVIDER_IDS.filter((p) => isOAuthProviderConfigured(p)),
    fresh: Boolean(session.fresh_until && session.fresh_until.getTime() > Date.now()),
  };
}
