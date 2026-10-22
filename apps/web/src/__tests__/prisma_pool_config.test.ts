import { describe, expect, it } from 'vitest';
import { buildPoolConfig } from '@/server/infrastructure/database/prisma_client';

describe('Postgres pool settings for serverless hosting (ADR-0047)', () => {
  it('passes the configured maximum to the pg pool and keeps the fail-fast connect timeout', () => {
    expect(buildPoolConfig('postgresql://u:p@h:5432/d', 3)).toEqual({
      connectionString: 'postgresql://u:p@h:5432/d',
      connectionTimeoutMillis: 5_000,
      max: 3,
    });
  });
});
