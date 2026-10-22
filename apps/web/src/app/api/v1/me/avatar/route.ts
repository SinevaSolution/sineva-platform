import { NextResponse, type NextRequest } from 'next/server';
import { AvatarSizeQuerySchema, RequestAvatarUploadSchema } from '@/server/application/dtos/avatar_dto';
import {
  getReadAvatarUseCase,
  getRemoveAvatarUseCase,
  getRequestAvatarUploadUseCase,
} from '@/server/container';
import {
  extractRequestId,
  handleRouteError,
  parseJsonBody,
  sendSuccessJson,
} from '@/server/http/response_helper';
import { withAuth } from '@/server/http/with_auth';

// The one non-envelope response of the profile family: image bytes. Private
// cache only, because the URL is per user and carries no signature; `v` in the
// query changes with every upload, so `immutable` is safe for one version.
export const GET = withAuth(
  async (request: NextRequest, { requestContext }) => {
    try {
      const { size } = AvatarSizeQuerySchema.parse({
        size: request.nextUrl.searchParams.get('size') ?? undefined,
      });
      const avatar = await getReadAvatarUseCase().execute({ user_id: requestContext.user_id, size });
      return new NextResponse(Buffer.from(avatar.bytes), {
        status: 200,
        headers: {
          'Content-Type': avatar.content_type,
          'Cache-Control': 'private, max-age=31536000, immutable',
          'X-Content-Type-Options': 'nosniff',
          'X-Request-Id': extractRequestId(request),
        },
      });
    } catch (err) {
      return handleRouteError(err, request);
    }
  },
  { scope: 'user', permission: 'profile.view' },
);

// Step 1 of the upload: returns a presigned PUT to a pending key.
export const POST = withAuth(
  async (request: NextRequest, { requestContext }) => {
    try {
      const body = RequestAvatarUploadSchema.parse(await parseJsonBody(request));
      const ticket = await getRequestAvatarUploadUseCase().execute({
        user_id: requestContext.user_id,
        ...body,
      });
      return sendSuccessJson({
        data: ticket,
        message: 'Avatar upload URL generated successfully.',
        request_id: requestContext.request_id,
        status: 201,
      });
    } catch (err) {
      return handleRouteError(err, request);
    }
  },
  { scope: 'user', permission: 'profile.update' },
);

export const DELETE = withAuth(
  async (request: NextRequest, { requestContext }) => {
    try {
      const profile = await getRemoveAvatarUseCase().execute({
        user_id: requestContext.user_id,
        context: requestContext,
      });
      return sendSuccessJson({
        data: profile,
        message: 'Avatar removed successfully.',
        request_id: requestContext.request_id,
        status: 200,
      });
    } catch (err) {
      return handleRouteError(err, request);
    }
  },
  { scope: 'user', permission: 'profile.update' },
);
