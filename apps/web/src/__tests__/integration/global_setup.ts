import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const WEB_ROOT = resolve(import.meta.dirname, '../../..');

export default function setup(): void {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) {
    throw new Error(
      'TEST_DATABASE_URL is required for integration tests, e.g. ' +
        'postgresql://user:pass@localhost:55432/sineva_platform_test',
    );
  }

  const url = new URL(raw);
  // The reset hook TRUNCATEs every platform table. Refusing anything whose
  // database name does not say "test" keeps a mistyped URL from wiping a
  // real database.
  if (!/test/i.test(url.pathname)) {
    throw new Error(
      `Refusing to run: database "${url.pathname.slice(1)}" does not look like a test database (name must contain "test").`,
    );
  }

  // `schema=platform` only relocates Prisma's own bookkeeping table
  // (_prisma_migrations) out of `public`, mirroring how production deploys.
  // The migration SQL is already schema-qualified.
  url.searchParams.set('schema', 'platform');

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: WEB_ROOT,
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: 'inherit',
  });
}
