import { resolve } from 'node:path';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Integration tests need a live Postgres and run through
    // vitest.integration.config.ts (`npm run test:integration`).
    exclude: [...configDefaults.exclude, 'src/__tests__/integration/**'],
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, './src'),
      // `server-only` resolves to a module that throws on import outside a
      // React Server Components build. Vitest runs plain Node, so without this
      // stub every test touching `server/infrastructure` or the container
      // would crash on the guard import.
      'server-only': resolve(
        import.meta.dirname,
        './src/__tests__/stubs/server_only.ts',
      ),
    },
  },
});
