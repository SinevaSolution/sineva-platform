import type { NextRequest } from 'next/server';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';
import {
  getDeleteLibraryDocumentUseCase,
  getGetLibraryDocumentUseCase,
  getUpdateLibraryDocumentUseCase,
} from '@/server/container';
import { UpdateLibraryDocumentSchema } from '@/server/application/dtos/library_dto';
import { toLibraryDocumentView } from '@/server/http/library_view';

type Params = { workspace_id: string; document_id: string };

export const GET = withAuth<Params>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const document = await getGetLibraryDocumentUseCase().execute(params?.document_id ?? '', requestContext);
      return sendSuccessJson({
        data: toLibraryDocumentView(document),
        message: 'Library document retrieved.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'library.read' },
);

export const PATCH = withAuth<Params>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const dto = UpdateLibraryDocumentSchema.parse(await parseJsonBody(request));
      const document = await getUpdateLibraryDocumentUseCase().execute(params?.document_id ?? '', dto, requestContext);
      return sendSuccessJson({
        data: toLibraryDocumentView(document),
        message: 'Library document updated.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'library.manage' },
);

export const DELETE = withAuth<Params>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const result = await getDeleteLibraryDocumentUseCase().execute(params?.document_id ?? '', requestContext);
      return sendSuccessJson({
        data: result,
        message: 'Library document deleted.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'library.delete' },
);
