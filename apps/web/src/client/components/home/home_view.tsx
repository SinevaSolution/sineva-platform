import { ArrowRight, CalendarClock, Inbox, Workflow } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';
import { SNSinoFigure } from '@/client/components/ui/sn_sino_figure';
import { specialistPose } from '@/client/components/ui/specialist_accent';
import { SNTooltip } from '@sineva/ui';
import { getTranslations } from '@/i18n/server';
import type { ShellSpecialistView } from '@/shared/shell_view';
import { HomeRecent } from './home_recent';

// Literal keys so the key-usage check can follow them.
function greetingKey(hour: number): string {
  if (hour < 11) return 'home.greeting_morning';
  if (hour < 15) return 'home.greeting_afternoon';
  if (hour < 19) return 'home.greeting_evening';
  return 'home.greeting_night';
}

const delay = (ms: number) => ({ '--d': `${ms}ms` }) as React.CSSProperties;

/**
 * Home is the base, New chat is the room. Home shows who is on the team
 * (top, one tap opens their room), where you left off, ideas to start, and
 * what is coming. Starting a conversation always happens in New chat.
 */
export async function HomeView({
  workspaceId,
  workspaceSlug,
  firstName,
  specialists,
  hour,
}: {
  workspaceId: string;
  workspaceSlug: string;
  firstName: string;
  specialists: ShellSpecialistView[];
  hour: number;
}) {
  const t = await getTranslations('workspace');
  const tShell = await getTranslations('shell');
  const tSpecialists = await getTranslations('specialists');
  const base = `/w/${workspaceSlug}`;
  const ideas = specialists.slice(0, 3).map((s) => ({ s, text: s.starter_prompts[0] }));

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[960px] px-4 pb-20 pt-[clamp(24px,6vh,56px)] sm:px-8">
        {/* Greeting + launch bar */}
        <div className="anim-rise">
          <h1 className="text-[clamp(26px,2vw+14px,36px)] font-semibold leading-[1.1] tracking-[-0.025em] text-text">
            {t(greetingKey(hour), { name: firstName })}
          </h1>
          <p className="mt-1.5 text-[15px] text-text-secondary">{t('home.subtitle')}</p>
        </div>

        {/* The team, on top */}
        <section aria-labelledby="team-heading" className="mt-6">
          <h2 id="team-heading" className="sr-only">
            {t('home.team_heading')}
          </h2>
          <ul className="-mx-4 flex snap-x gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-7 sm:overflow-visible sm:px-0">
            <TeamMember
              href={`${base}/new`}
              pose="wave"
              name={tSpecialists('marker.team')}
              role={t('home.team_role')}
              hint={t('home.team_hint')}
              d={60}
            />
            {specialists.map((s, i) => (
              <TeamMember
                key={s.agent_slug}
                href={`${base}/new?with=${s.agent_slug}`}
                pose={specialistPose(s.agent_slug)}
                name={s.display_name}
                role={s.role_title}
                hint={t('home.private_hint', { name: s.display_name })}
                d={110 + i * 50}
              />
            ))}
          </ul>
        </section>

        <Link
          href={`${base}/new`}
          className="anim-rise group mt-6 flex h-14 items-center gap-3 rounded-lg border border-border-strong bg-surface ps-2 pe-4 text-[15px] text-text-tertiary shadow-xs transition-[border-color,box-shadow] duration-200 hover:border-focus hover:shadow-(--shadow-focus-halo)"
          style={delay(420)}
        >
          <SNSinoFigure pose="wave" size={40} />
          <span className="flex-1">{t('home.launch')}</span>
          <ArrowRight aria-hidden="true" className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <section aria-labelledby="recent-heading" className="anim-rise" style={delay(480)}>
            <h2 id="recent-heading" className="mb-2 text-[13px] font-medium text-text-secondary">
              {t('home.recent_heading')}
            </h2>
            <HomeRecent workspaceId={workspaceId} workspaceSlug={workspaceSlug} specialists={specialists} />
          </section>

          <div className="space-y-8">
            {ideas.length > 0 ? (
              <section aria-labelledby="ideas-heading" className="anim-rise" style={delay(540)}>
                <h2 id="ideas-heading" className="mb-2 text-[13px] font-medium text-text-secondary">
                  {t('home.ideas_heading')}
                </h2>
                <ul className="space-y-1.5">
                  {ideas.map(({ s, text }) => (
                    <li key={s.agent_slug}>
                      <Link
                        href={`${base}/new?with=${s.agent_slug}&prompt=${encodeURIComponent(text)}`}
                        className="flex items-center gap-2.5 rounded-md border border-border p-2 pe-3 text-[13px] text-text transition-colors hover:border-border-strong hover:bg-(--state-hover)"
                      >
                        <SNSinoFigure pose={specialistPose(s.agent_slug)} size={36} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[11px] font-medium text-text-tertiary">{s.display_name}</span>
                          {text}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section aria-labelledby="next-heading" className="anim-rise" style={delay(600)}>
              <h2 id="next-heading" className="mb-2 text-[13px] font-medium text-text-secondary">
                {t('home.coming_heading')}
              </h2>
              <ul className="grid grid-cols-3 gap-1.5">
                {[
                  { href: `${base}/inbox`, label: tShell('features.inbox.label'), Icon: Inbox },
                  { href: `${base}/workflows`, label: tShell('features.workflows.label'), Icon: Workflow },
                  { href: `${base}/routines`, label: tShell('features.routines.label'), Icon: CalendarClock },
                ].map(({ href, label, Icon }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="flex flex-col gap-2 rounded-md bg-canvas-alt p-3 text-[13px] font-medium text-text-secondary transition-colors hover:bg-(--state-hover) hover:text-text"
                    >
                      <Icon aria-hidden="true" className="size-4" strokeWidth={1.75} />
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function TeamMember({
  href,
  pose,
  name,
  role,
  hint,
  d,
}: {
  href: string;
  pose: Parameters<typeof SNSinoFigure>[0]['pose'];
  name: string;
  role: string;
  hint: string;
  d: number;
}) {
  return (
    <li className="anim-rise w-[116px] shrink-0 snap-start sm:w-auto" style={delay(d)}>
      <SNTooltip label={hint}>
        <Link
          href={href}
          className="group flex flex-col items-center rounded-lg px-1.5 pb-2.5 pt-1.5 text-center transition-colors duration-150 hover:bg-(--state-hover)"
        >
          <span className="relative flex w-full justify-center after:absolute after:inset-x-3 after:bottom-0 after:h-px after:bg-[linear-gradient(90deg,transparent,var(--color-border-strong),transparent)]">
            <SNSinoFigure
              pose={pose}
              size={84}
              className="transition-transform duration-300 ease-out group-hover:-translate-y-1.5"
            />
          </span>
          <span className="mt-2 text-[13px] font-medium text-text transition-colors group-hover:text-text-brand">{name}</span>
          <span className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-text-tertiary">{role}</span>
        </Link>
      </SNTooltip>
    </li>
  );
}
