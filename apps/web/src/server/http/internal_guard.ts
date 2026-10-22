import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { getEnvConfig } from '@/server/infrastructure/config/env';

export function verifyInternalApiKey(request: NextRequest): boolean {
  const header = request.headers.get('x-internal-api-key');
  if (!header) return false;

  const env = getEnvConfig();
  const validKeys = [
    env.ai_engine_internal_api_key,
    env.ai_engine_internal_api_key_next,
  ].filter((key): key is string => Boolean(key && key.trim().length > 0));

  return validKeys.some((k) => k === header.trim());
}

// Compares digests, not the raw strings, so the comparison takes the same time
// whatever the length or the matching prefix of the candidate.
function safeEqual(a: string, b: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}

/**
 * Vercel Cron cannot send custom headers; it sends `Authorization: Bearer
 * $CRON_SECRET`. With no CRON_SECRET configured this is always false, so a
 * request carrying `Bearer undefined` or an empty bearer never passes.
 */
export function verifyCronBearer(request: NextRequest): boolean {
  const secret = getEnvConfig().cron_secret;
  if (!secret) return false;
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return false;
  return safeEqual(header.slice('Bearer '.length), secret);
}

/**
 * For the scheduler-triggered job routes only: the internal key (a scheduler
 * we run ourselves) or the cron bearer (Vercel). The ingest routes that
 * sineva-ai calls keep `verifyInternalApiKey`, so the cron secret cannot write
 * data there.
 */
export function verifyInternalJobCaller(request: NextRequest): boolean {
  return verifyInternalApiKey(request) || verifyCronBearer(request);
}
