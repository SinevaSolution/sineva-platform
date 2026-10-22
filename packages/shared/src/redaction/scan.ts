import { detectPii } from '../pii';

export interface SecretMatch {
  pattern_id: string;
  start: number;
  end: number;
}

/** Credential spans in `text` with the id of the pattern that found each. Never throws. */
export function scanForSecrets(text: string): SecretMatch[] {
  return detectPii(text)
    .filter((match) => match.kind === 'secret')
    .map((match) => ({ pattern_id: match.pattern_id ?? 'unknown', start: match.start, end: match.end }));
}

/** True when `text` holds anything a credential pattern matches. For output lint and canary scans. */
export function containsSecret(text: string): boolean {
  return scanForSecrets(text).length > 0;
}
