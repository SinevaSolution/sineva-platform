import type { NextRequest } from 'next/server';
import { RequestOwnershipTransferSchema } from '@/server/application/dtos/member_dto';
import {
  getCancelOwnershipTransferUseCase,
  getGetOwnershipTransferUseCase,
  getRequestOwnershipTransferUseCase,
} from '@/server/container';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

// The open transfer of the workspace, or `data: null`. Owner only.
export const GET = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      const transfer = await getGetOwnershipTransferUseCase().execute({ context: requestContext });
      return sendSuccessJson({
        data: transfer,
        message: 'Ownership transfer retrieved successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'workspace.transfer_ownership' },
);

// Sensitive: a fresh session is required (FR-AUTH-06). Nothing changes until the
// chosen admin confirms through the emailed link.
export const POST = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      const body = RequestOwnershipTransferSchema.parse(await parseJsonBody(request));
      const transfer = await getRequestOwnershipTransferUseCase().execute({
        context: requestContext,
        target_member_id: body.target_member_id,
      });
      return sendSuccessJson(
        {
          data: transfer,
          message: 'Ownership transfer requested. The admin must confirm by email.',
          request_id: requestContext.request_id,
          status: 201,
        },
        { status: 201 },
      );
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'workspace.transfer_ownership', requireFreshSession: true },
);

export const DELETE = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      await getCancelOwnershipTransferUseCase().execute({ context: requestContext });
      return sendSuccessJson({
        data: null,
        message: 'Ownership transfer cancelled.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'workspace.transfer_ownership' },
);
