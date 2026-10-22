import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoggerCardRejectionLog } from '@/server/infrastructure/logging/log_card_rejection_log';

describe('card.rejected logging (WP-M0-32, FR-AX-09, FR-AX-51)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('logs the code, the run handle and schema paths, never card content', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    new LoggerCardRejectionLog().rejected({
      code: 'schema_invalid',
      run_handle: 'run_abc',
      issue_paths: ['/specialist', '/limit_key'],
      cause: new TypeError('secret card text'),
    });
    const entry = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(entry).toEqual({
      level: 'warn',
      event: 'card.rejected',
      code: 'schema_invalid',
      run_handle: 'run_abc',
      issue_paths: ['/specialist', '/limit_key'],
      reason: 'TypeError',
    });
    expect(JSON.stringify(entry)).not.toContain('secret card text');
  });

  it('works with only a code', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    new LoggerCardRejectionLog().rejected({ code: 'unknown_card_type' });
    expect(JSON.parse(spy.mock.calls[0]![0] as string)).toEqual({
      level: 'warn',
      event: 'card.rejected',
      code: 'unknown_card_type',
    });
  });
});
