'use client';

import * as React from 'react';
import { cn } from '@/client/components/ui/cn';
import { SinoLoop } from '@/client/components/ui/sino_loop';
import { roomFor, roomLoop, type RoomMood } from './room_model';

/**
 * A chat that happens inside a room (Sintra pattern). The room photo fills
 * the panel, a scrim on the left keeps the chat readable, and a living Sino
 * stands on the room floor on the right, switching loops with the chat's
 * mood. The pointer moves the room and Sino a few pixels in opposite
 * directions for depth. Under reduced motion the parallax is off and Sino is
 * a still poster (SinoLoop handles that).
 *
 * The background is a CSS image-set (AVIF, then WebP) over a tinted
 * gradient, so a room that is not rendered yet still looks intentional.
 */
export function RoomStage({
  slug,
  mood,
  label,
  header,
  footer,
  children,
}: {
  /** Specialist slug, or null for the team chat with Sino. */
  slug: string | null;
  mood: RoomMood;
  /** Name tag over Sino, e.g. "SinoFinance". */
  label: string;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const room = roomFor(slug);
  const ref = React.useRef<HTMLElement>(null);

  // Parallax through two CSS variables, written at most once per frame.
  React.useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--px', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
        el.style.setProperty('--py', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
      });
    };
    el.addEventListener('pointermove', onMove);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('pointermove', onMove);
    };
  }, []);

  return (
    <section
      ref={ref}
      className="relative isolate flex min-h-0 flex-1 overflow-hidden bg-[var(--ink-950,#0b2a31)] [--px:0] [--py:0]"
    >
      {/* Room */}
      <div aria-hidden="true" className="absolute -inset-4 -z-20">
        <div
          key={room.slug}
          className="anim-fade absolute inset-0 bg-cover bg-[position:60%_center] transition-transform duration-500 ease-out"
          style={{
            backgroundImage: `image-set(url("${room.background}.avif") type("image/avif"), url("${room.background}.webp") type("image/webp")), radial-gradient(80% 70% at 70% 40%, #1f5c63, #0b2a31)`,
            transform: 'translate3d(calc(var(--px) * -14px), calc(var(--py) * -8px), 0) scale(1.03)',
          }}
        />
      </div>
      {/* Scrim: darker behind the chat column, clear where Sino stands. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(6,24,28,0.62)_0%,rgba(6,24,28,0.38)_42%,rgba(6,24,28,0.06)_72%),linear-gradient(0deg,rgba(6,24,28,0.45),transparent_35%)]"
      />

      {/* Sino on the floor */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 right-[3%] -z-10 hidden w-[min(44%,560px)] md:block"
        style={{ transform: 'translate3d(calc(var(--px) * 10px), calc(var(--py) * 4px), 0)' }}
      >
        <div className="anim-rise relative mx-auto flex w-fit -translate-y-3 items-center gap-1.5 rounded-full bg-[color-mix(in_oklab,var(--color-surface)_90%,transparent)] px-3 py-1 text-xs font-semibold text-fg shadow-popover backdrop-blur-md [--d:300ms]">
          <span className={cn('size-1.5 rounded-full', mood === 'working' ? 'animate-pulse bg-[#ffb547]' : 'bg-[#22c55e]')} />
          {label}
        </div>
        <span className="absolute bottom-[3%] left-1/2 h-[6%] w-[46%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(0,0,0,0.45),transparent)]" />
        <SinoLoop key={roomLoop(slug, mood)} loop={roomLoop(slug, mood)} priority className="anim-fade relative" />
      </div>

      {/* Chat column */}
      <div className="relative flex min-h-0 w-full flex-1 flex-col md:max-w-[min(640px,58%)]">
        {header}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer}
      </div>
    </section>
  );
}

/** Frosted bubble used on top of a room. */
export function RoomBubble({
  from,
  children,
}: {
  from: 'user' | 'companion';
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] leading-6 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.5)] backdrop-blur-md',
        from === 'user'
          ? 'ml-auto rounded-br-md bg-[color-mix(in_oklab,var(--color-focus)_78%,#0b2a31)] text-white'
          : 'rounded-tl-md bg-[color-mix(in_oklab,var(--color-surface)_92%,transparent)] text-fg',
      )}
    >
      {children}
    </div>
  );
}
