import 'server-only';
import { scanForSecrets } from '@sineva/shared';
import type { SecretPayload } from '@/server/domain/vault/vault';

/** Keeps mailbox content usable while stripping credentials, including provider echoes. */
export function redactToolResult(
  value: Record<string, unknown>,
  credentials: SecretPayload,
): Record<string, unknown> {
  const secrets = Object.values(credentials)
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .sort((a, b) => b.length - a.length);
  const visit = (entry: unknown): unknown => {
    if (typeof entry === 'string') {
      let text = entry;
      for (const secret of secrets) text = text.split(secret).join('[REDACTED]');
      const spans = scanForSecrets(text).sort((a, b) => b.start - a.start);
      for (const span of spans)
        text = `${text.slice(0, span.start)}[REDACTED]${text.slice(span.end)}`;
      return text;
    }
    if (Array.isArray(entry)) return entry.map(visit);
    if (entry && typeof entry === 'object')
      return Object.fromEntries(Object.entries(entry).map(([k, v]) => [k, visit(v)]));
    return entry;
  };
  return visit(value) as Record<string, unknown>;
}
