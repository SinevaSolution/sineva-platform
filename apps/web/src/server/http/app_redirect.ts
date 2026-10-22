import { getEnvConfig } from '@/server/infrastructure/config/env';

/**
 * A redirect target on the app's own configured address. Not
 * `new URL(path, request.url)`: `next start` reports `localhost` in
 * `request.url` even when the app was opened at `127.0.0.1`, and a redirect to
 * a different host drops the session cookie that was just set for the first.
 * The OAuth redirect URI is built from the same setting, so the callback always
 * arrives on this host.
 */
export function appRedirectUrl(path: string): URL {
  return new URL(path, getEnvConfig().next_public_app_url);
}
