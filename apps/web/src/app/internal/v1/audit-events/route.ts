import type { NextRequest } from 'next/server';
import { IngestAuditEventSchema } from '@/server/application/audit/ingest_audit_event_dto';
import { getIngestAuditEventUseCase } from '@/server/container';
import { verifyInternalApiKey } from '@/server/http/internal_guard';
import {
  extractRequestId,
  handleRouteError,
  parseJsonBody,
  sendErrorJson,
  sendSuccessJson,
} from '@/server/http/response_helper';

// Guarded by X-Internal-Api-Key only: sineva-ai cannot mint a signed context
// (the key pair is asymmetric on purpose), so there is no session or
// workspace membership to check here. The workspace id in the body is checked
// against the database by the use case instead.
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
    const body = IngestAuditEventSchema.parse(await parseJsonBody(request));
    await getIngestAuditEventUseCase().execute(body, requestId);

    return sendSuccessJson({
      data: { accepted: true },
      message: 'Audit event recorded.',
      request_id: requestId,
      status: 201,
    });
  } catch (error) {
    return handleRouteError(error, request);
  }
}
