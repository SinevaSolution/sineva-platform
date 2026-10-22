'use client';

import * as React from 'react';
import { useTranslations } from '@/i18n/provider';

/**
 * Each auth screen tells its own small story on the left, so people know
 * where they are at a glance: sign in = the team at work (orbit), sign up =
 * meet the team (line-up), forgot = Sino flies a letter over, reset = Sino
 * rebuilding access, verify = thumbs up.
 */
export type AuthScene = 'orbit' | 'lineup' | 'mail' | 'build' | 'thumbs';

// Literal keys, not `scene.${scene}.headline`: the key-usage check follows
// string literals and cannot follow a computed key.
const KEYS: Record<AuthScene, { headline: string; line: string }> = {
  orbit: { headline: 'scene.orbit.headline', line: 'scene.orbit.line' },
  lineup: { headline: 'scene.lineup.headline', line: 'scene.lineup.line' },
  mail: { headline: 'scene.mail.headline', line: 'scene.mail.line' },
  build: { headline: 'scene.build.headline', line: 'scene.build.line' },
  thumbs: { headline: 'scene.thumbs.headline', line: 'scene.thumbs.line' },
};

const delay = (ms: number) => ({ '--d': `${ms}ms` }) as React.CSSProperties;

export function SceneCopy({ scene }: { scene: AuthScene }) {
  const t = useTranslations('auth');
  return (
    <>
      <p className="anim-rise text-[clamp(28px,2vw+10px,40px)] font-semibold leading-[1.08] tracking-[-0.03em] text-fg">
        {t(KEYS[scene].headline)}
      </p>
      <p className="anim-rise mt-2.5 max-w-[40ch] text-[15px] text-fg-secondary" style={delay(80)}>
        {t(KEYS[scene].line)}
      </p>
    </>
  );
}
