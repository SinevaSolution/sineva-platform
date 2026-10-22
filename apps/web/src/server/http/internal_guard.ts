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
