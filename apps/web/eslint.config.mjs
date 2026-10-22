import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import noHardcodedStrings from './eslint-rules/no-hardcoded-strings.mjs';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'node_modules/**',
    'coverage/**',
    'next-env.d.ts',
    // Prisma client output: machine-generated and rebuilt on every
    // `db:generate`, so lint rules on it are noise.
    'src/server/infrastructure/database/generated/**',
  ]),
  {
    // Client code ships to the browser. Anything under `src/server` (or a
    // module guarded by `server-only`) either leaks backend code and secrets
    // into the bundle or fails the build with a far less readable error, so
    // the boundary is enforced at lint time. Types the client needs belong in
    // `src/shared`.
    files: ['src/client/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/server', '@/server/*', '../**/server/**'],
              message:
                'Client code must not import from src/server. Put shared types in src/shared.',
            },
            {
              group: ['server-only'],
              message:
                "'server-only' marks backend modules and must not appear in client code.",
            },
          ],
        },
      ],
    },
  },
  {
    // Every string a customer reads is a message key in messages/en.json and
    // messages/id.json (FR-UX-34). API routes, the internal key route and the
    // developer-facing /api-docs page are not customer UI.
    files: ['src/client/**/*.{ts,tsx}', 'src/app/**/*.{ts,tsx}'],
    ignores: ['src/app/api/**', 'src/app/api-docs/**', 'src/app/internal/**'],
    plugins: { sineva: { rules: { 'no-hardcoded-strings': noHardcodedStrings } } },
    rules: { 'sineva/no-hardcoded-strings': 'error' },
  },
]);
