import { describe, expect, it } from 'vitest';
import { pickLoopSource } from '@/client/components/ui/sino_loop_source';

const env = (userAgent: string, o: Partial<{ hevc: boolean; webm: boolean; touch: number }> = {}) => ({
  userAgent,
  maxTouchPoints: o.touch ?? 0,
  canPlayHevc: o.hevc ?? false,
  canPlayWebm: o.webm ?? true,
});

const SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1';

describe('pickLoopSource', () => {
  it('gives Safari the HEVC alpha MOV', () => {
    expect(pickLoopSource(env(SAFARI, { hevc: true }))).toBe('mov');
  });
  it('gives WebKit without HEVC the poster only', () => {
    expect(pickLoopSource(env(SAFARI, { hevc: false }))).toBeNull();
  });
  it('treats every iOS browser as WebKit', () => {
    expect(pickLoopSource(env(IPHONE_CHROME, { hevc: true }))).toBe('mov');
  });
  it('treats iPadOS desktop mode (Mac UA with touch) as WebKit', () => {
    expect(pickLoopSource(env(SAFARI.replace('Version/17.0 ', ''), { hevc: true, touch: 5 }))).toBe('mov');
  });
  it('gives Chrome the WebM even when it claims HEVC (it drops alpha)', () => {
    expect(pickLoopSource(env(CHROME, { hevc: true }))).toBe('webm');
  });
  it('gives nothing when no alpha format plays', () => {
    expect(pickLoopSource(env(CHROME, { webm: false }))).toBeNull();
  });
});
