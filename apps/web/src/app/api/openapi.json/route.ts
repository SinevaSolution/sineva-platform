import { NextResponse } from 'next/server';
import { getOpenApiSpec } from '@/infrastructure/openapi/spec';

export async function GET() {
  return NextResponse.json(getOpenApiSpec(), { status: 200 });
}
