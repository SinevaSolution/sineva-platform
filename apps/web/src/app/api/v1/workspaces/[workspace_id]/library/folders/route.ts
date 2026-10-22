import type { NextRequest } from 'next/server';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';
import { getCreateLibraryFolderUseCase, getListLibraryFoldersUseCase } from '@/server/container';
import { CreateLibraryFolderSchema } from '@/server/application/dtos/library_dto';
import { toLibraryFolderView } from '@/server/http/library_view';

export const GET = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      const result = await getListLibraryFoldersUseCase().execute(requestContext);
      return sendSuccessJson({
        data: { items: result.items.map(toLibraryFolderView) },
        message: 'Library folders retrieved.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'library.read' },
);

export const POST = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      const dto = CreateLibraryFolderSchema.parse(await parseJsonBody(request));
      const folder = await getCreateLibraryFolderUseCase().execute(dto, requestContext);
      return sendSuccessJson({
        data: toLibraryFolderView(folder),
        message: 'Library folder created.',
        request_id: requestContext.request_id,
        status: 201,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'library.manage' },
);
