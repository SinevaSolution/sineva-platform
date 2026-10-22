import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import noHardcodedStrings from './eslint-rules/no-hardcoded-strings.mjs';
import { designRulesConfig } from '../../packages/ui/eslint/design_rules.mjs';

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
    // Server code logs only through the wrapper in
    // `src/server/infrastructure/logging/logger.ts`: a fixed event name plus
    // allowlisted metadata, with free-text fields masked (FR-SEC-19, FR-SEC-20).
    // A direct `console` call has no allowlist, no masking, and is how
    // upstream bodies reached the logs before. The second selector is the
    // belt for the wrapper's type-level allowlist: it flags content-like keys
    // at the call site so the intent is rejected in review tooling, not only
    // by the compiler. The key list is a heuristic; the type is the contract.
    files: ['src/server/**/*.{ts,tsx}', 'src/app/api/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='console']",
          message:
            'Do not call console in server code. Use the logger wrapper (@/server/infrastructure/logging/logger): fixed event name plus allowlisted fields.',
        },
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name=/^(stdout|stderr)$/]",
          message:
            'Do not write to process streams in server code. Use the logger wrapper (@/server/infrastructure/logging/logger).',
        },
        {
          selector:
            ":matches(CallExpression[callee.object.name='logger'][callee.property.name=/^(error|warn|info)$/]) :matches(Property[key.name=/^(body|.*_body|request|response|prompt|.*_prompt|reply|reply_.*|user_message|message_text|messages?|payload|.*_payload|tool_args|arguments|content)$/], Property[key.value=/^(body|.*_body|request|response|prompt|.*_prompt|reply|reply_.*|user_message|message_text|messages?|payload|.*_payload|tool_args|arguments|content)$/])",
          message:
            'Do not log content (request or response bodies, prompts, replies, tool payloads). Log status, code and byte_length only.',
        },
      ],
    },
  },
  {
    // The wrapper is the one place that writes to console.
    files: ['src/server/infrastructure/logging/**'],
    rules: { 'no-restricted-syntax': 'off' },
  },
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
            {
              // The SN components own these libraries (ADR-0028): one place
              // decides how a menu, dialog or toast looks and behaves.
              group: ['@radix-ui/*', 'sonner', 'vaul', 'cmdk'],
              message:
                'Use the SN component from @sineva/ui (SNDropdownMenu, SNDialog, SNDrawer, SNSelect, snToast) instead of the underlying library.',
            },
          ],
        },
      ],
    },
  },
  // Design-system rails (FR-DS-04, FR-UX-05): semantic tokens only, no dark:
  // variant, no arbitrary z-index, logical properties, no motion packages, no
  // dangerouslySetInnerHTML. The same rules guard packages/ui; they live there.
  designRulesConfig({ files: ['src/client/**/*.{ts,tsx}'] }),
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
