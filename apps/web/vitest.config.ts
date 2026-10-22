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
      // Workspace packages added after the last `npm install` have no
      // node_modules link yet, and a linked worktree would resolve an existing
      // link to the main checkout. Pointing at the source keeps tests on the
      // code under review.
      '@sineva/i18n': resolve(import.meta.dirname, '../../packages/i18n/index.ts'),
      '@sineva/ui/format': resolve(import.meta.dirname, '../../packages/ui/src/lib/format.ts'),
      '@sineva/ui/theme': resolve(import.meta.dirname, '../../packages/ui/src/lib/theme.ts'),
      // Listed after the sub-path aliases: Vite tries aliases in order and a
      // plain string key also matches `@sineva/ui/...`.
      '@sineva/ui': resolve(import.meta.dirname, '../../packages/ui/src/index.ts'),
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
