import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Pure token and lint tests run in plain Node. A component test opts into
    // jsdom with a `// @vitest-environment jsdom` docblock, so the CSS and
    // lint suites do not pay for a DOM they never touch.
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Lint fixtures are deliberately broken files, linted by a test, never run.
    exclude: ['node_modules/**', 'src/__tests__/lint_fixtures/**'],
  },
});
