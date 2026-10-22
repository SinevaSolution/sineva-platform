import type { NextRequest } from 'next/server';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';
import { getDeleteLibraryFolderUseCase, getUpdateLibraryFolderUseCase } from '@/server/container';
import { UpdateLibraryFolderSchema } from '@/server/application/dtos/library_dto';
import { toLibraryFolderView } from '@/server/http/library_view';

type Params = { workspace_id: string; folder_id: string };

export const PATCH = withAuth<Params>(
  async (request: NextRequest, { requestContext, params }) => {
    try {
      const dto = UpdateLibraryFolderSchema.parse(await parseJsonBody(request));
      const folder = await getUpdateLibraryFolderUseCase().execute(params?.folder_id ?? '', dto, requestContext);
      return sendSuccessJson({
        data: toLibraryFolderView(folder),
        message: 'Library folder updated.',
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
      const result = await getDeleteLibraryFolderUseCase().execute(params?.folder_id ?? '', requestContext);
      return sendSuccessJson({
        data: result,
        message: 'Library folder deleted.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'library.manage' },
);
