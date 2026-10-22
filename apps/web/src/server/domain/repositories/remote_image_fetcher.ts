/**
 * Downloads an image another service hosts (an OAuth provider's profile
 * picture). Implementations must refuse hosts they do not trust, never follow
 * redirects, and bound size and time. Returns null when the download fails or
 * the host is not allowed, so a sign-up never fails because of a picture.
 */
export interface RemoteImageFetcher {
  fetch(url: string, max_bytes: number): Promise<Uint8Array | null>;
}
