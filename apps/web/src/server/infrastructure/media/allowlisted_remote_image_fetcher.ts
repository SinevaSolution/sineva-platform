import 'server-only';
import type { RemoteImageFetcher } from '@/server/domain/repositories/remote_image_fetcher';
import { logger } from '../logging/logger';

// Exact hosts of the two sign-in providers' picture CDNs. An allowlist beats a
// private-range blocklist here: with the request limited to two public names
// there is no DNS-rebinding or metadata-IP surface to defend, and no redirect
// is followed, so an allowed host cannot bounce the request to an internal one.
const ALLOWED_HOSTS = new Set(['lh3.googleusercontent.com', 'avatars.githubusercontent.com']);
const TIMEOUT_MS = 5_000;

export class AllowlistedRemoteImageFetcher implements RemoteImageFetcher {
  async fetch(url: string, max_bytes: number): Promise<Uint8Array | null> {
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      return this.skip('invalid_url');
    }
    if (target.protocol !== 'https:' || target.port !== '' || target.username || target.password) {
      return this.skip('scheme_not_allowed');
    }
    if (!ALLOWED_HOSTS.has(target.hostname)) {
      return this.skip('host_not_allowed');
    }

    try {
      const response = await fetch(target, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { Accept: 'image/jpeg,image/png,image/webp' },
      });
      if (!response.ok || !response.body) {
        return this.skip(`status_${response.status}`);
      }
      const declared = Number(response.headers.get('content-length') ?? '0');
      if (declared > max_bytes) {
        return this.skip('too_large');
      }

      // Read in chunks and stop at the limit: Content-Length can be absent or wrong.
      const chunks: Uint8Array[] = [];
      let total = 0;
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        total += chunk.length;
        if (total > max_bytes) {
          return this.skip('too_large');
        }
        chunks.push(chunk);
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      return bytes;
    } catch (error) {
      return this.skip(error instanceof Error ? error.name : 'unknown');
    }
  }

  private skip(reason: string): null {
    logger.warn('avatar.remote_fetch_failed', { reason });
    return null;
  }
}
