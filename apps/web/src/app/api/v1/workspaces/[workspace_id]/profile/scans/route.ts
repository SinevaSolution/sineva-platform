import type { NextRequest } from 'next/server';
import { getRequestProfileScanUseCase } from '@/server/container';
import { ScanRequestSchema } from '@/server/application/dtos/onboarding_dto';
import { handleRouteError, parseJsonBody, sendSuccessJson } from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

// Reads one public web page through sineva-ai and returns the scan with its
// suggestions (nothing is written to the profile). The call waits for the
// result, up to 25 s. Instagram and marketplace links are refused with
// `unsupported_scan_source`: those inputs are stored as links and handles only.
// sineva-ai down is a typed 503 and a bad answer a typed 502; onboarding goes
// on without scan results either way.
export const POST = withAuth<{ workspace_id: string }>(
  async (request: NextRequest, { requestContext }) => {
    try {
      const input = ScanRequestSchema.parse(await parseJsonBody(request));
      const scan = await getRequestProfileScanUseCase().execute({
        workspace_id: requestContext.workspace_id as string,
        user_id: requestContext.user_id,
        input,
        context: requestContext,
      });
      return sendSuccessJson({
        data: { scan },
        message: 'Website scan finished.',
        request_id: requestContext.request_id,
        status: 201,
      });
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  { scope: 'workspace', permission: 'business_profile.scan' },
);
