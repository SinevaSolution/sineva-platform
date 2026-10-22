import 'server-only';
import {
  ConnectorUnreachableError,
  ConnectorResponseTooLargeError,
  type ConnectorHttpClient,
  type ConnectorHttpRequest,
  type ConnectorHttpResponse,
} from '@/server/domain/connections/connector';

/** A driver asked for a URL outside its provider's allowlist. A bug or an attack, never a runtime condition to retry. */
export class EgressDeniedError extends Error {
  constructor(readonly provider_id: string) {
    super(`egress_denied:${provider_id}`);
    this.name = 'EgressDeniedError';
  }
}

export interface EgressHttpClientOptions {
  /** `ConnectorRegistry.isEgressAllowed`: https, exact host, allowed path prefix. */
  isAllowed: (providerId: string, url: string) => boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 1024 * 1024;

/**
 * The only network path of a connector driver (ADR-0037). It refuses any URL
 * outside the provider's allowlist before a socket opens, never follows a
 * redirect (a redirect would leave the allowlist unchecked), and bounds time and
 * size. Request and response bodies carry credentials, so nothing here logs or
 * quotes them: failures become typed errors with a status at most.
 */
export class EgressHttpClient implements ConnectorHttpClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;

  constructor(private readonly options: EgressHttpClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxBytes = options.maxResponseBytes ?? DEFAULT_MAX_BYTES;
  }

  async request(request: ConnectorHttpRequest): Promise<ConnectorHttpResponse> {
    if (!this.options.isAllowed(request.provider_id, request.url)) {
      throw new EgressDeniedError(request.provider_id);
    }
    let response: Response;
    try {
      response = await this.fetchImpl(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      // Network failure, timeout, TLS error, refused redirect: all "could not reach".
      throw new ConnectorUnreachableError(null);
    }
    const body = await this.readCapped(response);
    return { status: response.status, body };
  }

  private async readCapped(response: Response): Promise<string> {
    const tooLarge = () => new ConnectorResponseTooLargeError(this.maxBytes);
    const declared = Number(response.headers.get('content-length') ?? '0');
    if (declared > this.maxBytes) {
      if (response.body) await response.body.cancel().catch(() => { throw tooLarge(); });
      throw tooLarge();
    }
    if (!response.body) return '';
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > this.maxBytes) {
          await reader.cancel().catch(() => { throw tooLarge(); });
          throw tooLarge();
        }
        chunks.push(value);
      }
    } catch (error) {
      if (error instanceof ConnectorResponseTooLargeError) throw error;
      throw new ConnectorUnreachableError(null);
    } finally { reader.releaseLock(); }
    const buffer = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder().decode(buffer);
  }
}
