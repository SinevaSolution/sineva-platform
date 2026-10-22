import { NextResponse } from 'next/server';
import { getOpenApiSpec } from '@/server/infrastructure/openapi/spec';
import { withAuth } from '@/server/http/with_auth';

export const GET = withAuth(
  async () => {
    return NextResponse.json(getOpenApiSpec(), { status: 200 });
  },
  { scope: 'public' },
);
