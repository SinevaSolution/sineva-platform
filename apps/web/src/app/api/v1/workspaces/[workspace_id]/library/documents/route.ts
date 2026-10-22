import type { NextRequest } from 'next/server';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';
import {
  getCreateLibraryDocumentUseCase,
  getListLibraryDocumentsUseCase,
} from '@/server/container';
import {
  CreateLibraryDocumentSchema,
  ListLibraryDocumentsQuerySchema,
} from '@/server/application/dtos/library_dto';
import { toLibraryDocumentView } from '@/server/http/library_view';

export const GET = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      const query = ListLibraryDocumentsQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
      const result = await getListLibraryDocumentsUseCase().execute(query, requestContext);
      return sendSuccessJson({
        data: { items: result.items.map(toLibraryDocumentView), next_cursor: result.next_cursor },
        message: 'Library documents retrieved.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'library.read' },
);

// Notes and text saved from a chat. URLs, crawls and synced sources are not
// accepted yet and fail validation.
export const POST = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      const dto = CreateLibraryDocumentSchema.parse(await parseJsonBody(request));
      const document = await getCreateLibraryDocumentUseCase().execute(dto, requestContext);
      return sendSuccessJson({
        data: toLibraryDocumentView(document),
        message: 'Library document created.',
        request_id: requestContext.request_id,
        status: 201,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'library.upload' },
);
