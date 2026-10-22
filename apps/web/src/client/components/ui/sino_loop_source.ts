// Which file of an alpha loop this browser should get. Pure (the environment
// is passed in) so each browser case is a unit test. Ported from sineva-compro
// (src/components/motion/sino-loop-source.ts); keep the two in step.

export type LoopKind = 'webm' | 'mov';

export type LoopEnv = Readonly<{
  userAgent: string;
  /** `navigator.maxTouchPoints`; tells iPadOS desktop mode from a Mac. */
  maxTouchPoints: number;
  canPlayHevc: boolean;
  canPlayWebm: boolean;
}>;

const IOS = /iPhone|iPad|iPod/;
const NOT_SAFARI = /Chrome|Chromium|CriOS|FxiOS|EdgiOS|Edg|OPR|OPiOS|Android/;

function isWebKit({ userAgent, maxTouchPoints }: LoopEnv): boolean {
  if (IOS.test(userAgent)) return true;
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return true;
  return /Safari\//.test(userAgent) && !NOT_SAFARI.test(userAgent);
}

/**
 * Pick by engine, not by canPlayType alone. WebKit gets the HEVC alpha MOV
 * (its WebM alpha is unreliable), or nothing. Everyone else gets VP9 alpha
 * WebM: Chrome may claim HEVC via hardware decode but drops the alpha
 * channel, painting a black box, so HEVC never decides for non-WebKit.
 */
export function pickLoopSource(env: LoopEnv): LoopKind | null {
  if (isWebKit(env)) return env.canPlayHevc ? 'mov' : null;
  return env.canPlayWebm ? 'webm' : null;
}

export function readLoopEnv(): LoopEnv | null {
  if (typeof document === 'undefined' || typeof navigator === 'undefined') return null;
  const probe = document.createElement('video');
  const can = (type: string) => (probe.canPlayType?.(type) ?? '') !== '';
  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    canPlayHevc: can('video/mp4; codecs="hvc1"'),
    canPlayWebm: can('video/webm; codecs="vp9"'),
  };
}
