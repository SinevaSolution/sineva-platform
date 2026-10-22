import Link from 'next/link';
import * as React from 'react';
import { cn } from '@/client/components/ui/cn';
import { SNSinoFigure } from '@/client/components/ui/sn_sino_figure';
import type { SinoPose } from '@/client/components/ui/specialist_accent';
import { SNSinoLoop } from '@/client/components/ui/sn_sino_loop';
import { ActivityTicker } from './activity_ticker';
import { SceneCopy, type AuthScene } from './scene_copy';

// The six specialists in their work poses, evenly spaced around Sino.
const CAST: { pose: SinoPose; name: string }[] = [
  { pose: 'whiteboard', name: 'SinoPeople' },
  { pose: 'coins', name: 'SinoFinance' },
  { pose: 'handshake', name: 'SinoSales' },
  { pose: 'megaphone', name: 'SinoSocial' },
  { pose: 'holding-phone', name: 'SinoHelp' },
  { pose: 'magnifier', name: 'SinoInsights' },
];

const FIGURE = 76;

const delay = (ms: number) => ({ '--d': `${ms}ms` }) as React.CSSProperties;

/**
 * Shared frame for every auth screen.
 *
 * Desktop: the brand art sits on a tinted layer that spans past the left
 * column and is masked to fade into the page white, so there is no seam
 * between the art and the form. The art is Sino at the centre with the six
 * specialists orbiting (the ring spins, each figure counter-spins to stay
 * upright), plus a ticker of what each one does. Transform and opacity only;
 * the global reduced-motion rule stops all of it.
 *
 * Phones: the form alone under a soft tint, since the art would push the
 * form below the fold.
 */
export type { AuthScene };

export function AuthCard({
  title,
  subtitle,
  pose = 'wave',
  scene = 'orbit',
  footer,
  children,
}: {
  scene?: AuthScene;
  title: string;
  subtitle?: React.ReactNode;
  pose?: SinoPose;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative isolate grid min-h-dvh overflow-hidden bg-surface lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <AuthBackdrop />

      <aside aria-hidden="true" className="relative hidden flex-col px-10 py-8 lg:flex">
        <span className="text-[15px] font-semibold tracking-[-0.01em] text-text">sineva</span>
        <div className="flex flex-1 items-center justify-center py-6">
          <Scene scene={scene} />
        </div>
        <div className="max-w-[460px]">
          <SceneCopy scene={scene} />
          {scene === 'orbit' || scene === 'lineup' ? (
            <div className="anim-rise mt-5" style={delay(160)}>
              <ActivityTicker />
            </div>
          ) : null}
        </div>
      </aside>

      <main className="relative flex flex-col px-5 py-8 sm:px-10">
        <Link href="/" className="text-[15px] font-semibold tracking-[-0.01em] text-text lg:invisible">
          sineva
        </Link>
        <div className="mx-auto flex w-full max-w-[380px] flex-1 flex-col justify-center py-10">
          <div className="anim-rise">
            <SNSinoFigure pose={pose} size={72} priority className="anim-float -ms-2 lg:hidden" />
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-text">{title}</h1>
            {subtitle ? <p className="mt-1.5 text-sm text-text-secondary">{subtitle}</p> : null}
          </div>
          <div className="anim-rise mt-7" style={delay(90)}>
            {children}
          </div>
          {footer ? (
            <p className="anim-rise mt-6 text-sm text-text-secondary" style={delay(160)}>
              {footer}
            </p>
          ) : null}
        </div>
      </main>
    </div>
  );
}

/**
 * The tint behind the art. It is wider than the left column and masked from
 * solid to transparent, so the colour melts into the page white under the
 * form instead of stopping at a line. Three soft blobs drift inside it.
 */
function AuthBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
      {/* Desktop: left-to-right fade. */}
      {/* The fade mask runs 90deg (towards the right), so the box is anchored physically left: mirroring it would put the tint under the form column. */}
      {/* eslint-disable sineva-design/no-physical-direction -- scene artwork with physical geometry */}
      <div className="absolute inset-y-0 left-0 hidden w-[72%] overflow-hidden bg-[color-mix(in_oklab,var(--color-focus)_10%,var(--color-surface))] [mask-image:var(--mask-fade-end)] lg:block">
        <span className="anim-drift absolute -left-[10%] -top-[15%] size-[70%] rounded-full bg-(image:--gradient-blob-mint) [--drift-duration:26s]" />
        <span className="anim-drift absolute bottom-[-20%] left-[25%] size-[65%] rounded-full bg-(image:--gradient-blob-sun) [--d:-9s] [--drift-duration:31s]" />
        <span className="anim-drift absolute right-[5%] top-[20%] size-[45%] rounded-full bg-(image:--gradient-blob-teal) [--d:-4s] [--drift-duration:23s]" />
      </div>
      {/* eslint-enable sineva-design/no-physical-direction */}
      {/* Phones and tablets: the same tint, fading downward instead. */}
      <div className="absolute inset-x-0 top-0 h-72 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-focus)_12%,var(--color-surface)),transparent)] lg:hidden" />
    </div>
  );
}

function Scene({ scene }: { scene: AuthScene }) {
  if (scene === 'orbit') return <Orbit />;
  if (scene === 'lineup') return <Lineup />;
  if (scene === 'mail') return <MailFlight />;
  return <SoloLoop loop={scene} />;
}

/** Sign up: the six step onto one floor in turn, a living Sino in front. */
function Lineup() {
  return (
    <div className="relative w-[min(560px,40vw)]">
      {/* Three on each side, a gap in the middle where Sino stands. */}
      <ul className="flex items-end justify-center after:absolute after:inset-x-0 after:bottom-1 after:h-px after:bg-[linear-gradient(90deg,transparent,var(--color-border-strong),transparent)]">
        {CAST.map((c, i) => (
          <li
            key={c.name}
            className={cn('anim-rise -mx-2', i === 3 && 'ms-[min(170px,12vw)]')}
            style={delay(120 + i * 110)}
          >
            <span className="anim-float block" style={delay(i * 600)}>
              <SNSinoFigure pose={c.pose} size={84} priority />
            </span>
          </li>
        ))}
      </ul>
      <div className="absolute bottom-0 start-1/2 w-[min(260px,19vw)] -translate-x-1/2 rtl:translate-x-1/2">
        <span className="absolute bottom-[4%] start-1/2 h-[7%] w-1/2 -translate-x-1/2 rtl:translate-x-1/2 rounded-[50%] bg-(image:--gradient-contact-shadow)" />
        <SNSinoLoop loop="wave" priority className="anim-rise relative [--d:700ms]" />
      </div>
    </div>
  );
}

/** Forgot password: Sino flies a letter across, along a dashed route. */
function MailFlight() {
  return (
    <div className="relative w-full max-w-[640px]">
      <svg aria-hidden="true" viewBox="0 0 640 200" className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-[var(--color-focus)] opacity-40">
        <path
          d="M10 150 C 160 40, 320 190, 470 80 S 620 60, 630 40"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="2 10"
          strokeLinecap="round"
          className="anim-dash"
        />
      </svg>
      <SNSinoLoop loop="flyby-mail" priority className="anim-rise relative" />
    </div>
  );
}

/** Reset and verify: one living Sino on a soft floor. */
function SoloLoop({ loop }: { loop: 'build' | 'thumbs' }) {
  return (
    <div className="relative w-[min(380px,30vw,48vh)]">
      <span className="absolute bottom-[5%] start-1/2 h-[7%] w-1/2 -translate-x-1/2 rtl:translate-x-1/2 rounded-[50%] bg-(image:--gradient-contact-shadow)" />
      <SNSinoLoop loop={loop} priority className="anim-rise relative" />
    </div>
  );
}

/**
 * Sino in the middle, the cast on one ring, a faster inner ring carrying two
 * small "message" dots between them. Sizes come from one --box variable so
 * the whole thing shrinks on short or narrow screens.
 */
function Orbit() {
  return (
    <div
      className="relative aspect-square [--box:min(480px,36vw,54vh)] [--r:calc(var(--box)*0.4)]"
      style={{ width: 'var(--box)' }}
    >
      {/* Rings */}
      <span className="absolute inset-[10%] rounded-full border border-dashed border-[color-mix(in_oklab,var(--color-focus)_35%,transparent)]" />
      <span className="absolute inset-[26%] rounded-full border border-[color-mix(in_oklab,var(--color-focus)_18%,transparent)]" />

      {/* Message dots on the inner ring */}
      <div className="anim-orbit absolute inset-0 [--orbit-duration:14s]">
        {[0, 180].map((a) => (
          <span
            key={a}
            // Orbit geometry: the dot is placed by rotate() and translateX() from the box center.
            // eslint-disable-next-line sineva-design/no-physical-direction -- orbit artwork
            className="absolute left-1/2 top-1/2 -ms-1 -mt-1 size-2 rounded-full bg-focus shadow-(--shadow-focus-dot)"
            style={{ transform: `rotate(${a}deg) translateX(calc(var(--box) * 0.24))` }}
          />
        ))}
      </div>

      {/* Sino */}
      <div className="anim-rise absolute inset-0 flex items-center justify-center">
        <SNSinoFigure pose="wave" size={150} priority className="anim-float" />
      </div>

      {/* Cast */}
      <div className="anim-orbit absolute inset-0">
        {CAST.map((c, i) => {
          const angle = (360 / CAST.length) * i - 90;
          return (
            <div
              key={c.name}
              // Orbit geometry: the figure is centered with left/top plus a negative margin.
              // eslint-disable-next-line sineva-design/no-physical-direction -- orbit artwork
              className="absolute left-1/2 top-1/2"
              style={{
                width: FIGURE,
                height: FIGURE,
                marginLeft: -FIGURE / 2,
                marginTop: -FIGURE / 2,
                transform: `rotate(${angle}deg) translateX(var(--r)) rotate(${-angle}deg)`,
              }}
            >
              <div className="anim-orbit-upright">
                <span className="anim-rise block" style={delay(200 + i * 70)}>
                  <SNSinoFigure pose={c.pose} size={FIGURE} priority />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AuthLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium text-text-brand underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}
