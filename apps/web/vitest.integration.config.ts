import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Integration tests need a real Postgres (TEST_DATABASE_URL) and live apart
// from `vitest.config.ts` so that `npm run test` never needs a database.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/__tests__/integration/**/*.int.test.ts'],
    globalSetup: ['src/__tests__/integration/global_setup.ts'],
    setupFiles: ['src/__tests__/integration/reset_database.ts'],
    // Every test truncates the same tables; files running in parallel would
    // wipe each other's rows.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, './src'),
      '@sineva/card-schemas': resolve(import.meta.dirname, '../../packages/card-schemas/src/index.ts'),
      '@sineva/shared': resolve(import.meta.dirname, '../../packages/shared/src/index.ts'),
      // See vitest.config.ts: `server-only` throws outside an RSC build.
      'server-only': resolve(
        import.meta.dirname,
        './src/__tests__/stubs/server_only.ts',
      ),
    },
  },
});
