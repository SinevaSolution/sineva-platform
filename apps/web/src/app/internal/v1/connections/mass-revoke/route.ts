import type { NextRequest } from 'next/server';
import { massRevokeRequestSchema } from '@/server/application/dtos/connection_dto';
import { getMassRevokeConnectionsUseCase } from '@/server/container';
import { verifyInternalApiKey } from '@/server/http/internal_guard';
import {
  extractRequestId,
  handleRouteError,
  parseJsonBody,
  sendErrorJson,
  sendSuccessJson,
} from '@/server/http/response_helper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Incident runbook: take every connection of one provider away, in every
// workspace (a provider breach, a leaked OAuth client secret). It needs the exact
// confirmation `revoke-all:<provider_id>` in the body, works in batches (call it
// again while `more` is true) and acts as the system; each connection is revoked
// and audited exactly like a person's disconnect.
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
    const body = massRevokeRequestSchema.parse(await parseJsonBody(request));
    const result = await getMassRevokeConnectionsUseCase().execute(body);
    return sendSuccessJson({
      data: result,
      message: 'Mass revoke batch finished.',
      request_id: requestId,
      status: 200,
    });
  } catch (error) {
    return handleRouteError(error, request);
  }
}
