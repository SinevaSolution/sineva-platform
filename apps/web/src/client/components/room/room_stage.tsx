'use client';

import * as React from 'react';
import { cn } from '@/client/components/ui/cn';
import { SNSinoLoop } from '@/client/components/ui/sn_sino_loop';
import { roomFor, roomLoop, type RoomMood } from './room_model';

/**
 * A chat that happens inside a room (Sintra pattern). The room photo fills
 * the panel, a scrim on the left keeps the chat readable, and a living Sino
 * stands on the room floor on the right, switching loops with the chat's
 * mood. The pointer moves the room and Sino a few pixels in opposite
 * directions for depth. Under reduced motion the parallax is off and Sino is
 * a still poster (SNSinoLoop handles that).
 *
 * The background is a CSS image-set (AVIF, then WebP) over a tinted
 * gradient, so a room that is not rendered yet still looks intentional.
 */
export function RoomStage({
  slug,
  mood,
  label,
  header,
  topBar,
  footer,
  children,
}: {
  /** Specialist slug, or null for the team chat with Sino. */
  slug: string | null;
  mood: RoomMood;
  /** Name tag over Sino, e.g. "SinoFinance". */
  label: string;
  header?: React.ReactNode;
  /** Full-width strip above the chat column and Sino (New chat's cast picker). */
  topBar?: React.ReactNode;
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
      className="relative isolate flex min-h-0 flex-1 flex-col overflow-hidden bg-(--room-scene-base) [container-type:size] [--px:0] [--py:0]"
    >
      {/* Room. A 16:9 box that always covers the panel (container units),
          anchored at 70% across and 60% down so Sino and the floor stay in
          view. Sino lives inside the same box in image coordinates, so his
          feet land on the rendered floor at any panel size. Placement comes
          from the Blender camera (sino-3d-mascot/export/rooms/rooms.json):
          frame = 0.555 of image height, left 0.628, bottom 0.124. */}
      <div
        aria-hidden="true"
        className="absolute -z-20 aspect-video w-[max(100cqw,calc(100cqh*16/9))]"
        style={{
          left: '70%',
          top: '60%',
          transform:
            'translate3d(calc(-70% + var(--px) * -14px), calc(-60% + var(--py) * -8px), 0) scale(1.03)',
        }}
      >
        <div
          key={room.slug}
          className="anim-fade absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `image-set(url("${room.background}.avif") type("image/avif"), url("${room.background}.webp") type("image/webp")), url("${room.background}-blur.webp"), var(--room-scene-fallback)`,
          }}
        />
        {/* Sino on the floor: hidden when the panel is too narrow for him
            to stand clear of the chat column. */}
        <div
          className="absolute hidden aspect-square h-[55.5%] [@container(min-aspect-ratio:6/5)]:block"
          style={{
            left: '62.8%',
            bottom: '12.4%',
            transform: 'translate3d(calc(var(--px) * 18px), calc(var(--py) * 6px), 0)',
          }}
        >
          <span className="absolute bottom-[4%] start-1/2 h-[7%] w-[52%] -translate-x-1/2 rtl:translate-x-1/2 rounded-[50%] bg-(image:--room-contact-shadow)" />
          <div className="anim-rise absolute start-1/2 top-[2%] flex -translate-x-1/2 rtl:translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface/90 px-3 py-1 text-xs font-semibold text-text shadow-md backdrop-blur-md [--d:300ms]">
            <span className={cn('size-1.5 rounded-full', mood === 'working' ? 'animate-pulse bg-warning' : 'bg-success')} />
            {label}
          </div>
          <SNSinoLoop key={roomLoop(slug, mood)} loop={roomLoop(slug, mood)} priority className="anim-fade relative" />
        </div>
      </div>
      {/* Scrim: darker behind the chat column, clear where Sino stands. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-(image:--room-scrim-side)"
      />

      {topBar}
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
        'max-w-[88%] whitespace-pre-wrap rounded-lg px-4 py-2.5 text-[15px] leading-6 shadow-md backdrop-blur-md',
        from === 'user'
          ? 'ms-auto rounded-ee-xs bg-(--room-bubble-user) text-text-inverse'
          : 'rounded-ss-xs bg-[color-mix(in_oklab,var(--color-surface)_92%,transparent)] text-text',
      )}
    >
      {children}
    </div>
  );
}
