import type { NextRequest } from 'next/server';
import { getSigningKeyRepository } from '@/server/container';
import { verifyInternalApiKey } from '@/server/http/internal_guard';
import {
  extractRequestId,
  sendErrorJson,
  sendSuccessJson,
} from '@/server/http/response_helper';

export async function GET(request: NextRequest) {
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
    const keyRepo = getSigningKeyRepository();
    const keys = await keyRepo.listValidPublicKeys('context');

    return sendSuccessJson({
      data: {
        keys: keys.map((k) => ({
          kid: k.kid,
          alg: k.alg,
          public_key: k.public_key,
          status: k.status,
          valid_until: k.valid_until,
        })),
      },
      request_id: requestId,
      status: 200,
    });
  } catch {
    return sendErrorJson({
      status: 500,
      code: 'internal_error',
      message: 'Failed to retrieve signing keys',
      request_id: requestId,
    });
  }
}
