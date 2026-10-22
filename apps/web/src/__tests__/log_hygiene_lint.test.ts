import { join, resolve } from 'node:path';
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

// FR-SEC-20: logging a request or response body, prompt, reply or tool payload
// is blocked by lint. These fixtures run the real eslint.config.mjs, so a rule
// that is removed or loosened fails here instead of passing silently.

const WEB_ROOT = resolve(import.meta.dirname, '..', '..');
const GATEWAY_FILE = join(
  WEB_ROOT,
  'src/server/infrastructure/gateways/example_gateway.ts',
);
const ROUTE_FILE = join(WEB_ROOT, 'src/app/api/v1/example/route.ts');
const LOGGER_FILE = join(WEB_ROOT, 'src/server/infrastructure/logging/logger.ts');

let eslint: ESLint;

async function lint(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => `${m.ruleId}: ${m.message}`);
}

describe('log hygiene lint rules', () => {
  beforeAll(() => {
    eslint = new ESLint({
      cwd: WEB_ROOT,
      overrideConfigFile: join(WEB_ROOT, 'eslint.config.mjs'),
    });
  });

  describe('direct console and stream writes are blocked in server code', () => {
    it.each([
      ['console.error', "console.error('x');"],
      ['console.log', "console.log('x');"],
      ['console.warn', "console.warn('x');"],
      ['console.info', "console.info('x');"],
      ['console.debug', "console.debug('x');"],
      ['process.stdout.write', "process.stdout.write('x');"],
      ['process.stderr.write', "process.stderr.write('x');"],
    ])('rejects %s in a gateway', async (_label, code) => {
      const messages = await lint(`${code}\n`, GATEWAY_FILE);
      expect(messages.length).toBeGreaterThan(0);
      expect(messages.join('\n')).toMatch(/logger/i);
    });

    it('rejects console in a route handler', async () => {
      const messages = await lint("console.error('x');\n", ROUTE_FILE);
      expect(messages.join('\n')).toMatch(/logger/i);
    });

    it('allows console inside the logger wrapper itself', async () => {
      const messages = await lint(
        "export const sink = (line: string) => { console.error(line); };\n",
        LOGGER_FILE,
      );
      expect(messages).toEqual([]);
    });
  });

  describe('content fields cannot be passed to the logger', () => {
    it.each([
      'body',
      'request_body',
      'response_body',
      'prompt',
      'system_prompt',
      'reply',
      'reply_content',
      'reply_text',
      'user_message',
      'message_text',
      'payload',
      'tool_payload',
      'tool_args',
      'arguments',
      'messages',
      'raw_body',
    ])('rejects a `%s` field', async (key) => {
      const code = `import { logger } from '@/server/infrastructure/logging/logger';\nexport function f(value: string) {\n  logger.error('ai_engine.non_2xx', { ${key}: value });\n}\n`;
      const messages = await lint(code, GATEWAY_FILE);
      expect(messages.join('\n')).toMatch(/content/i);
    });

    it('rejects the shorthand form `{ body }`', async () => {
      const code = `import { logger } from '@/server/infrastructure/logging/logger';\nexport function f(body: string) {\n  logger.error('ai_engine.non_2xx', { body });\n}\n`;
      const messages = await lint(code, GATEWAY_FILE);
      expect(messages.join('\n')).toMatch(/content/i);
    });

    it('rejects a quoted key', async () => {
      const code = `import { logger } from '@/server/infrastructure/logging/logger';\nexport function f(value: string) {\n  logger.warn('ai_engine.non_2xx', { 'prompt': value });\n}\n`;
      const messages = await lint(code, GATEWAY_FILE);
      expect(messages.join('\n')).toMatch(/content/i);
    });

    it('accepts allowlisted metadata', async () => {
      const code = `import { logger } from '@/server/infrastructure/logging/logger';\nexport function f(status: number, size: number) {\n  logger.error('ai_engine.non_2xx', { status, byte_length: size, code: 'UPSTREAM' });\n}\n`;
      const messages = await lint(code, GATEWAY_FILE);
      expect(messages).toEqual([]);
    });

    it('does not flag the same key names outside a logger call', async () => {
      const code = `export const request = { body: 'x', prompt: 'y' };\n`;
      const messages = await lint(code, GATEWAY_FILE);
      expect(messages).toEqual([]);
    });
  });
});
