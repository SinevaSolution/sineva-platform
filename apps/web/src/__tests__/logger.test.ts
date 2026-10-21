import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createLogger,
  logger,
  utf8ByteLength,
  type LogFields,
  type LogLevel,
} from '@/server/infrastructure/logging/logger';

// FR-SEC-19, FR-SEC-20: logs hold no content and mask Indonesian identifiers.

const NIK = '3273011508900001';
const EMAIL = 'budi.santoso@contoh.co.id';
const PHONE = '081234567890';

function capture() {
  const lines: Array<{ level: LogLevel; entry: Record<string, unknown> }> = [];
  const log = createLogger((level, line) => {
    lines.push({ level, entry: JSON.parse(line) as Record<string, unknown> });
  });
  return { log, lines };
}

describe('logger wrapper', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes one JSON line with level, fixed event and allowlisted fields', () => {
    const { log, lines } = capture();

    log.error('ai_engine.non_2xx', {
      status: 502,
      code: 'UPSTREAM_ERROR',
      byte_length: 1234,
      latency_ms: 87,
      request_id: 'req_01',
      aborted: false,
    });

    expect(lines).toEqual([
      {
        level: 'error',
        entry: {
          level: 'error',
          event: 'ai_engine.non_2xx',
          status: 502,
          code: 'UPSTREAM_ERROR',
          byte_length: 1234,
          latency_ms: 87,
          request_id: 'req_01',
          aborted: false,
        },
      },
    ]);
  });

  it('masks a NIK, an email and a phone number inside an allowed string field', () => {
    const { log, lines } = capture();
    const body = `{"detail":"NIK ${NIK} email ${EMAIL} telp ${PHONE}"}`;

    log.error('ai_engine.non_json', { reason: body });

    const out = JSON.stringify(lines);
    expect(out).not.toContain(NIK);
    expect(out).not.toContain(EMAIL);
    expect(out).not.toContain(PHONE);
    expect(lines[0]?.entry.reason).toBe(
      '{"detail":"NIK [NIK] email [EMAIL] telp [PHONE]"}',
    );
  });

  it('masks every element of a string list field', () => {
    const { log, lines } = capture();

    log.error('ai_engine.contract_violation', {
      issue_paths: ['data.reply_content', `data:${EMAIL}`],
    });

    expect(lines[0]?.entry.issue_paths).toEqual([
      'data.reply_content',
      'data:[EMAIL]',
    ]);
  });

  it('drops fields that are not on the allowlist and reports how many', () => {
    const { log, lines } = capture();
    // Cast: the compiler already rejects these keys, this is the runtime
    // backstop for untyped callers and `as` casts.
    const sneaky = {
      status: 500,
      body: `reply with ${NIK}`,
      prompt: 'system prompt text',
      reply_content: 'hello Budi',
      user_id: 'usr_secret',
      tool_payload: { to: EMAIL },
    } as unknown as LogFields;

    log.error('ai_engine.non_2xx', sneaky);

    const entry = lines[0]?.entry;
    expect(entry).toEqual({
      level: 'error',
      event: 'ai_engine.non_2xx',
      status: 500,
      dropped_fields: 5,
    });
    const out = JSON.stringify(lines);
    for (const leaked of [NIK, EMAIL, 'system prompt text', 'hello Budi', 'usr_secret']) {
      expect(out).not.toContain(leaked);
    }
  });

  it('drops an allowed key whose value has the wrong type', () => {
    const { log, lines } = capture();

    log.warn('ai_engine.non_2xx', {
      status: { nested: NIK },
      byte_length: Number.NaN,
    } as unknown as LogFields);

    expect(lines[0]?.entry).toEqual({
      level: 'warn',
      event: 'ai_engine.non_2xx',
      dropped_fields: 2,
    });
  });

  it('truncates long strings so a pasted body cannot ride in an allowed field', () => {
    const { log, lines } = capture();

    log.error('ai_engine.non_json', { reason: 'x'.repeat(5_000) });

    expect(String(lines[0]?.entry.reason).length).toBeLessThanOrEqual(200);
  });

  it('refuses event names outside the fixed list and free-form fields at compile time', () => {
    const { log } = capture();

    // @ts-expect-error free text is not a LogEvent
    log.error('chat request failed for budi@contoh.co.id', { status: 1 });
    // @ts-expect-error `body` is not an allowed field
    log.error('ai_engine.non_2xx', { body: 'x' });
    // @ts-expect-error `prompt` is not an allowed field
    log.error('ai_engine.non_2xx', { prompt: 'x' });
    // @ts-expect-error `reply_content` is not an allowed field
    log.error('ai_engine.non_2xx', { reply_content: 'x' });
  });

  it('routes the default logger to console by level', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    logger.error('ai_engine.non_2xx', { status: 500 });
    logger.warn('ai_engine.non_2xx', { status: 429 });
    logger.info('ai_engine.non_2xx', { status: 200 });

    expect(error).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]?.[0])).toContain('"status":500');
  });

  it('measures UTF-8 bytes, not characters', () => {
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('é')).toBe(2);
  });
});
