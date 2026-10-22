import type { NextRequest } from 'next/server';
import { IngestEventSchema } from '@/server/application/library/ingest_event_dto';
import { getApplyIngestEventUseCase } from '@/server/container';
import { verifyInternalApiKey } from '@/server/http/internal_guard';
import {
  extractRequestId,
  handleRouteError,
  parseJsonBody,
  sendErrorJson,
  sendSuccessJson,
} from '@/server/http/response_helper';

// Ingest progress from sineva-ai. Guarded by X-Internal-Api-Key only: sineva-ai
// cannot mint a signed context, so there is no session or membership to check.
// The tenant in the body is a claim; the use case accepts it only if that
// workspace owns the document. Every answer below 4xx is an acknowledgement,
// including "duplicate" and "not applied" (stale), so sineva-ai never retries
// an event the platform has already judged.
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
    const body = IngestEventSchema.parse(await parseJsonBody(request));
    const result = await getApplyIngestEventUseCase().execute(
      {
        event_id: body.event_id,
        tenant_id: body.tenant_id,
        document_id: body.document_id,
        job_id: body.job_id,
        sequence: body.sequence,
        stage: body.stage,
        status: body.status,
        occurred_at: body.occurred_at,
        progress: body.progress ?? null,
        reason_code: body.reason_code ?? null,
        pages: body.pages,
        page_count: body.page_count ?? null,
        chunk_count: body.chunk_count ?? null,
        language: body.language ?? null,
        embedding_model: body.embedding_model ?? null,
        ocr_pages: body.ocr_pages ?? null,
        personal_data_hint: body.personal_data_hint,
      },
      requestId,
    );

    return sendSuccessJson({
      data: result,
      message: 'Ingest event recorded.',
      request_id: requestId,
      status: 200,
    });
  } catch (error) {
    return handleRouteError(error, request);
  }
}
