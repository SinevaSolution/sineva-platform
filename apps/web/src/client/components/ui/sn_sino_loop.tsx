'use client';

import * as React from 'react';
import { cn } from './cn';
import { pickLoopSource, readLoopEnv, type LoopKind } from './sino_loop_source';

// Alpha-channel Sino loops from the compro (v011 render). Width and height
// reserve the box so poster and video swap without layout shift.
export const SINO_LOOPS = {
  wave: { file: 'sino-loop-wave', width: 720, height: 720 },
  phone: { file: 'sino-loop-phone', width: 720, height: 720 },
  build: { file: 'sino-loop-build', width: 720, height: 720 },
  thumbs: { file: 'sino-loop-thumbs', width: 720, height: 720 },
  confused: { file: 'sino-loop-confused', width: 720, height: 720 },
  'flyby-mail': { file: 'sino-flyby-mail', width: 1280, height: 540 },
} as const;

export type SinoLoopName = keyof typeof SINO_LOOPS;

const REDUCED = '(prefers-reduced-motion: reduce)';

/**
 * Which file to play, or null for poster only. The server snapshot is null,
 * so SSR and first hydration paint the poster (the video's own first frame),
 * and reduced motion never gets a video element at all.
 */
function useLoopKind(): LoopKind | null {
  return React.useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(REDUCED);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => {
      if (window.matchMedia(REDUCED).matches) return null;
      const env = readLoopEnv();
      return env ? pickLoopSource(env) : null;
    },
    () => null,
  );
}

/**
 * A living Sino. Plays only while on screen and the tab is visible, so a
 * page with several loops never decodes ones nobody can see. Decorative:
 * no controls, hidden from assistive tech.
 */
export function SinoLoop({
  loop,
  className,
  priority = false,
}: {
  loop: SinoLoopName;
  className?: string;
  priority?: boolean;
}) {
  const asset = SINO_LOOPS[loop];
  const base = `/mascot/loops/${asset.file}`;
  const kind = useLoopKind();
  const ref = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let inView = false;
    const sync = () => {
      if (inView && !document.hidden) video.play()?.catch(() => {});
      else video.pause();
    };
    const io = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      sync();
    });
    io.observe(video);
    document.addEventListener('visibilitychange', sync);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', sync);
      video.pause();
    };
  }, [kind, loop]);

  const box = cn('block h-auto w-full select-none object-contain', className);
  const ratio = { aspectRatio: `${asset.width} / ${asset.height}` };

  if (!kind) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- static alpha poster, no optimizer needed
      <img
        src={`${base}.webp`}
        alt=""
        width={asset.width}
        height={asset.height}
        loading={priority ? 'eager' : 'lazy'}
        draggable={false}
        className={box}
        style={ratio}
      />
    );
  }
  return (
    <video
      key={`${loop}-${kind}`}
      ref={ref}
      src={`${base}.${kind}`}
      poster={`${base}.webp`}
      width={asset.width}
      height={asset.height}
      muted
      playsInline
      loop
      preload={priority ? 'auto' : 'metadata'}
      aria-hidden="true"
      disablePictureInPicture
      disableRemotePlayback
      className={box}
      style={ratio}
    />
  );
}
