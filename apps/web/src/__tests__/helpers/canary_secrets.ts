import { randomBytes } from 'node:crypto';
import { vi } from 'vitest';

// Canary credentials for the token scan (plan gate G1, FR-SEC-39): fake tokens
// with a unique marker, shaped like real ones, seeded into a flow. Afterwards
// every captured log line, response body and stored row is searched for the
// marker. A marker that survives means a credential reached a place it must not.
//
// The shapes matter: the redactor works on shapes, so a canary that matches no
// pattern would pass for the wrong reason. Each helper builds a token a real
// provider could issue, with the marker inside it.

export function marker(label: string): string {
  return `CNRY${label}${randomBytes(6).toString('hex')}`;
}

export interface CanarySet {
  access_token: string;
  refresh_token: string;
  client_secret: string;
  code: string;
  state: string;
  code_verifier: string;
  api_key: string;
  bearer: string;
  /** Every marker string, for the final search. */
  markers: string[];
}

export function seedCanaries(): CanarySet {
  const access = marker('acc');
  const refresh = marker('ref');
  const secret = marker('cs');
  const code = marker('code');
  const state = marker('state');
  const verifier = marker('ver');
  const apiKey = marker('key');
  const bearer = marker('bear');
  return {
    access_token: `ya29.${access}abcdefghijklmnop`,
    refresh_token: `1//0g${refresh}abcdefghijklmnopqrstuvwxyz`,
    client_secret: `GOCSPX-${secret}`,
    code: `4/0A${code}`,
    state: `${state}xxxxxxxx`,
    code_verifier: `${verifier}-abcdefghijklmnopqrstuvwxyz-0123456789`,
    api_key: `xnd_development_${apiKey}abcdefghij`,
    bearer: `${bearer}abcdefghijklmnopqrstuvwxyz`,
    markers: [access, refresh, secret, code, state, verifier, apiKey, bearer],
  };
}

export interface ConsoleCapture {
  lines: string[];
  text(): string;
  restore(): void;
}

/** Captures everything written through console.* (the logger's only sink). */
export function captureConsole(): ConsoleCapture {
  const lines: string[] = [];
  const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      lines.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '));
    }),
  );
  return {
    lines,
    text: () => lines.join('\n'),
    restore: () => spies.forEach((spy) => spy.mockRestore()),
  };
}

/** Throws a readable error naming the first marker found in `haystack`. */
export function assertNoMarkers(label: string, haystack: string, canaries: CanarySet): void {
  for (const marker of canaries.markers) {
    if (haystack.includes(marker)) {
      throw new Error(`canary marker ${marker} leaked into ${label}`);
    }
  }
}
