import type { NextRequest } from 'next/server';
import { rotateVaultKeysRequestSchema } from '@/server/application/dtos/jobs_dto';
import { getVaultKeyRotation } from '@/server/container';
import { verifyInternalApiKey } from '@/server/http/internal_guard';
import {
  extractRequestId,
  handleRouteError,
  parseOptionalJsonBody,
  sendErrorJson,
  sendSuccessJson,
} from '@/server/http/response_helper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Runbook command (ADR-0036 decision 8): after a new KEK is configured with the
// old one as VAULT_LOCAL_KEK_PREVIOUS, call this until `more` is false and `failed`
// is 0, then retire the old key. It rewraps data keys only; no secret is decrypted
// here, and the answer carries counts, never key material.
export async function POST(request: NextRequest) {
  const requestId = extractRequestId(request);

  if (!verifyInternalApiKey(request)) {
    return sendErrorJson({
      status: 401,
      code: 'unauthorized',
      message: 'Missing or invalid X-Internal-Api-Key header',
      request_id: requestId,
    });
  }

  try {
    const body = rotateVaultKeysRequestSchema.parse(await parseOptionalJsonBody(request));
    const result = await getVaultKeyRotation().rotate(body.limit);
    return sendSuccessJson({
      data: result,
      message: 'Vault key rotation batch finished.',
      request_id: requestId,
      status: 200,
    });
  } catch (error) {
    return handleRouteError(error, request);
  }
}
