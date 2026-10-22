import type { NextRequest } from 'next/server';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';
import { getTryLibraryRetrievalUseCase } from '@/server/container';
import { TryLibrarySchema } from '@/server/application/dtos/library_dto';

// "Try a question". The body names a specialist at most: the retrieval scope is
// computed from the session, so a body carrying principals is refused (strict schema).
export const POST = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      const dto = TryLibrarySchema.parse(await parseJsonBody(request));
      const result = await getTryLibraryRetrievalUseCase().execute(dto, requestContext);
      return sendSuccessJson({
        data: result,
        message: 'Library retrieval completed.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'library.manage' },
);
