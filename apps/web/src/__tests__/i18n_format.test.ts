import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TIME_ZONE,
  formatDate,
  formatIdr,
  formatNumber,
  formatRelativeTime,
} from '@sineva/ui/format';

describe('formatIdr', () => {
  it('writes rupiah as "Rp 1.500.000" without decimals in both UI languages', () => {
    expect(formatIdr(1_500_000, 'id').replace(/\s/g, ' ')).toBe('Rp 1.500.000');
    expect(formatIdr(1_500_000, 'en').replace(/\s/g, ' ')).toBe('Rp 1.500.000');
  });

  it('rounds away fractions rather than showing decimals', () => {
    expect(formatIdr(1999.6, 'id').replace(/\s/g, ' ')).toBe('Rp 2.000');
  });

  it('keeps the space unbreakable so Rp never wraps from its number', () => {
    expect(formatIdr(5000, 'id')).toContain(' ');
  });
});

describe('formatNumber', () => {
  it('uses the locale grouping', () => {
    expect(formatNumber(8000, 'id')).toBe('8.000');
    expect(formatNumber(8000, 'en')).toBe('8,000');
  });
});

describe('formatDate', () => {
  const at = new Date('2026-10-22T17:30:00Z');

  it('defaults to Asia/Jakarta, so 17:30 UTC is already the next day in Jakarta', () => {
    expect(DEFAULT_TIME_ZONE).toBe('Asia/Jakarta');
    expect(formatDate(at, 'en', { dateStyle: 'medium', timeStyle: 'short' })).toContain('Oct 23, 2026');
  });

  it('honours an explicit time zone', () => {
    expect(formatDate(at, 'en', { dateStyle: 'medium', timeZone: 'UTC' })).toBe('Oct 22, 2026');
  });

  it('formats for Indonesian', () => {
    expect(formatDate(at, 'id', { dateStyle: 'long' })).toBe('23 Oktober 2026');
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-10-22T12:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it('rounds to minutes, hours and days, in the UI language', () => {
    expect(formatRelativeTime(ago(5 * 60_000), 'en', now)).toBe('5 minutes ago');
    expect(formatRelativeTime(ago(3 * 3_600_000), 'en', now)).toBe('3 hours ago');
    expect(formatRelativeTime(ago(2 * 86_400_000), 'en', now)).toBe('2 days ago');
    expect(formatRelativeTime(ago(5 * 60_000), 'id', now)).toBe('5 menit yang lalu');
  });

  it('says "now" for the current minute', () => {
    expect(formatRelativeTime(now.toISOString(), 'en', now)).toBe('now');
  });
});
