import { describe, expect, it } from 'vitest';
import { mask, PII_PLACEHOLDERS } from '../pii';
import patterns from './redaction_patterns.json';
import { containsSecret, scanForSecrets } from './scan';

// WP-M2-06 (FR-CONN-17, FR-SEC-39): the credential pattern list is data with a
// positive and a negative row per pattern. These tests walk the data, so adding
// a pattern without rows fails here.

const SECRET = PII_PLACEHOLDERS.secret;

describe('redaction pattern list', () => {
  it('is a versioned list with unique snake_case ids', () => {
    expect(patterns.version).toBe(1);
    const ids = patterns.patterns.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it('every pattern compiles and states where it came from', () => {
    for (const entry of patterns.patterns) {
      expect(() => new RegExp(entry.pattern, `${entry.flags}g`), entry.id).not.toThrow();
      expect(['documented', 'recalled'], entry.id).toContain(entry.provenance);
      expect(entry.description.length, entry.id).toBeGreaterThan(10);
    }
  });

  it('every pattern has at least one positive and one negative row', () => {
    for (const entry of patterns.patterns) {
      expect(entry.positive.length, `${entry.id} positive rows`).toBeGreaterThan(0);
      expect(entry.negative.length, `${entry.id} negative rows`).toBeGreaterThan(0);
    }
  });

  it('covers the credential families of the connection layer', () => {
    const ids = new Set(patterns.patterns.map((entry) => entry.id));
    for (const required of [
      'authorization_basic',
      'telegram_token_in_url',
      'oauth_code_param',
      'oauth_state_param',
      'token_field_value',
      'xendit_secret_key',
      'midtrans_server_key',
      'webhook_signature_value',
    ]) {
      expect(ids.has(required), required).toBe(true);
    }
  });

  describe.each(patterns.patterns)('$id', (entry) => {
    it.each(entry.positive)('masks exactly the credential in: $text', ({ text, secret }) => {
      expect(text).toContain(secret);
      expect(mask(text)).toBe(text.replace(secret, SECRET));
    });

    it.each(entry.positive)('reports the pattern id for: $text', ({ text, secret }) => {
      const hit = scanForSecrets(text).find((found) => text.slice(found.start, found.end) === secret);
      expect(hit?.pattern_id).toBe(entry.id);
      expect(containsSecret(text)).toBe(true);
    });

    it.each(entry.negative)('leaves ordinary text alone: %s', (text) => {
      expect(mask(text)).toBe(text);
      expect(containsSecret(text)).toBe(false);
    });

    it('is idempotent on its positive rows', () => {
      for (const { text } of entry.positive) {
        expect(mask(mask(text))).toBe(mask(text));
      }
    });
  });
});

describe('existing secret shapes keep their ids', () => {
  it.each([
    ['bearer', 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789', 'Bearer abcdefghijklmnopqrstuvwxyz0123456789'],
    ['snv_pat', 'token snv_pat_abcdefgh12345678', 'snv_pat_abcdefgh12345678'],
    ['model_key_sk', 'key sk-ant-api03-abcdefghijklmnopqrstuvwxyz', 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz'],
  ])('%s', (id, text, secret) => {
    const hit = scanForSecrets(text).find((found) => text.slice(found.start, found.end) === secret);
    expect(hit?.pattern_id).toBe(id);
  });
});

describe('ordinary text', () => {
  it.each([
    'Kode verifikasi sudah dikirim ke nomor kamu. Masukkan kode itu untuk lanjut.',
    'Aku sudah menyiapkan draf pesan untuk pelanggan. Tinjau dulu sebelum dikirim.',
    'Status pesanan: dikirim. Tanda tangan penerima tersimpan di dokumen.',
    'The state of the project is fine; the code review finished and the token budget is unchanged.',
    'Rekap penjualan minggu ini: 120 pesanan, rata-rata Rp 150.000 per pesanan.',
  ])('is not changed by the redactor: %s', (text) => {
    expect(mask(text)).toBe(text);
    expect(scanForSecrets(text)).toEqual([]);
  });

  it('keeps the surrounding structure of a masked URL readable', () => {
    expect(mask('GET /cb?code=4/0AX4XfWhCANARYcode123&state=Zk3pQ9vLmN2xRt7WbYc4Hd8 200')).toBe(
      `GET /cb?code=${SECRET}&state=${SECRET} 200`,
    );
  });
});

describe('performance on hostile input', () => {
  it.each([
    ['repeated code=', 'code='.repeat(50_000)],
    ['repeated state', '?state='.repeat(40_000)],
    ['long token field name run', 'access_token'.repeat(20_000)],
    ['long hex run after signature', `signature: ${'a'.repeat(200_000)}`],
    ['repeated Basic', 'Basic '.repeat(40_000)],
    ['base64 run', 'A'.repeat(200_000)],
  ])('stays fast on %s', (_label, input) => {
    const startedAt = performance.now();
    expect(() => mask(input)).not.toThrow();
    expect(performance.now() - startedAt).toBeLessThan(1_500);
  });
});
