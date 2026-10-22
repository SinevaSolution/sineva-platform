import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { LocaleSchema } from '@/server/application/dtos/locale_dto';
import { getJwtAuthService } from '@/server/container';
import {
  extractRequestId,
  handleRouteError,
  parseJsonBody,
  sendSuccessJson,
} from '@/server/http/response_helper';
import { verifyCsrf } from '@/server/http/csrf_guard';
import { withAuth } from '@/server/http/with_auth';

const SignUpSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .max(128, 'Password cannot exceed 128 characters'),
  full_name: z.string().min(1, 'Full name is required').max(100),
  terms_accepted_version: z.string().min(1, 'Terms acceptance is required'),
  privacy_accepted_version: z.string().min(1, 'Privacy policy acceptance is required'),
  marketing_opt_in: z.boolean().optional(),
  locale: LocaleSchema.optional(),
  timezone: z.string().optional(),
});

export const POST = withAuth(
  async (request: NextRequest) => {
    const requestId = extractRequestId(request);

    try {
      verifyCsrf(request);
      const body = await parseJsonBody(request);
      const validated = SignUpSchema.parse(body);

      const authService = getJwtAuthService();
      const result = await authService.signUp({
        email: validated.email,
        password: validated.password,
        full_name: validated.full_name,
        terms_accepted_version: validated.terms_accepted_version,
        privacy_accepted_version: validated.privacy_accepted_version,
        marketing_opt_in: validated.marketing_opt_in,
        locale: validated.locale,
        timezone: validated.timezone,
      });

      return sendSuccessJson(
        {
          data: result,
          message:
            'Account created successfully. Please check your email to verify your account.',
          request_id: requestId,
          status: 201,
        },
        { status: 201 },
      );
    } catch (error) {
      return handleRouteError(error, request);
    }
  },
  {
    scope: 'public',
  },
);
