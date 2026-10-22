import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import { designRulesConfig } from './eslint/design_rules.mjs';

export default defineConfig([
  globalIgnores([
    'node_modules/**',
    // Broken on purpose; lint_rules.test.ts lints them with ignore disabled.
    'src/__tests__/lint_fixtures/**',
  ]),
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mjs}'],
    rules: {
      // Underscore-prefixed names are the project's way to mark an unused argument.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  // Components and helpers. Tests, scripts and the eslint rules themselves
  // contain raw values on purpose (fixtures, contrast tables, regexes).
  designRulesConfig({
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/__tests__/**', 'src/**/*.test.{ts,tsx}'],
  }),
  {
    // packages/ui is imported by apps/web, never the other way round, and it
    // holds no server code (architecture.test.ts checks the same on disk).
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/__tests__/**', 'src/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/*', '@sineva/web', '@sineva/web/*', '**/apps/web/**'],
              message: 'packages/ui must not import from apps/web. Pass data and callbacks in as props.',
            },
            {
              group: ['server-only', '@/server/*'],
              message: 'packages/ui holds no server code.',
            },
          ],
        },
      ],
    },
  },
  // Fixtures are linted by the test with the same rules as real source.
  designRulesConfig({ files: ['src/__tests__/lint_fixtures/**/*.tsx'] }),
  {
    files: ['src/__tests__/lint_fixtures/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/*', '@sineva/web', '@sineva/web/*', '**/apps/web/**'], message: 'no apps/web imports' },
            { group: ['server-only', '@/server/*'], message: 'no server code' },
          ],
        },
      ],
    },
  },
]);
