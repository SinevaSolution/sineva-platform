import { ArrowRight, CalendarClock, Inbox, Workflow } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';
import { SinoFigure } from '@/client/components/ui/sino_figure';
import { specialistPose } from '@/client/components/ui/specialist_accent';
import { Tooltip } from '@/client/components/ui/tooltip';
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
          <h1 className="text-[clamp(26px,2vw+14px,36px)] font-semibold leading-[1.1] tracking-[-0.025em] text-fg">
            {t(greetingKey(hour), { name: firstName })}
          </h1>
          <p className="mt-1.5 text-[15px] text-fg-secondary">{t('home.subtitle')}</p>
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
          className="anim-rise group mt-6 flex h-14 items-center gap-3 rounded-2xl border border-line-strong bg-surface pl-2 pr-4 text-[15px] text-fg-tertiary shadow-[0_1px_2px_rgba(11,42,49,0.04)] transition-[border-color,box-shadow] duration-200 hover:border-[var(--color-focus)] hover:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-focus)_12%,transparent)]"
          style={delay(420)}
        >
          <SinoFigure pose="wave" size={40} />
          <span className="flex-1">{t('home.launch')}</span>
          <ArrowRight aria-hidden="true" className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <section aria-labelledby="recent-heading" className="anim-rise" style={delay(480)}>
            <h2 id="recent-heading" className="mb-2 text-[13px] font-medium text-fg-secondary">
              {t('home.recent_heading')}
            </h2>
            <HomeRecent workspaceId={workspaceId} workspaceSlug={workspaceSlug} specialists={specialists} />
          </section>

          <div className="space-y-8">
            {ideas.length > 0 ? (
              <section aria-labelledby="ideas-heading" className="anim-rise" style={delay(540)}>
                <h2 id="ideas-heading" className="mb-2 text-[13px] font-medium text-fg-secondary">
                  {t('home.ideas_heading')}
                </h2>
                <ul className="space-y-1.5">
                  {ideas.map(({ s, text }) => (
                    <li key={s.agent_slug}>
                      <Link
                        href={`${base}/new?with=${s.agent_slug}&prompt=${encodeURIComponent(text)}`}
                        className="flex items-center gap-2.5 rounded-xl border border-line p-2 pr-3 text-[13px] text-fg transition-colors hover:border-line-strong hover:bg-hover"
                      >
                        <SinoFigure pose={specialistPose(s.agent_slug)} size={36} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[11px] font-medium text-fg-tertiary">{s.display_name}</span>
                          {text}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section aria-labelledby="next-heading" className="anim-rise" style={delay(600)}>
              <h2 id="next-heading" className="mb-2 text-[13px] font-medium text-fg-secondary">
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
                      className="flex flex-col gap-2 rounded-xl bg-surface-alt p-3 text-[13px] font-medium text-fg-secondary transition-colors hover:bg-hover hover:text-fg"
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
  pose: Parameters<typeof SinoFigure>[0]['pose'];
  name: string;
  role: string;
  hint: string;
  d: number;
}) {
  return (
    <li className="anim-rise w-[116px] shrink-0 snap-start sm:w-auto" style={delay(d)}>
      <Tooltip label={hint}>
        <Link
          href={href}
          className="group flex flex-col items-center rounded-2xl px-1.5 pb-2.5 pt-1.5 text-center transition-colors duration-150 hover:bg-hover"
        >
          <span className="relative flex w-full justify-center after:absolute after:inset-x-3 after:bottom-0 after:h-px after:bg-[linear-gradient(90deg,transparent,var(--color-border-strong),transparent)]">
            <SinoFigure
              pose={pose}
              size={84}
              className="transition-transform duration-300 ease-[var(--ease-out-quint)] group-hover:-translate-y-1.5"
            />
          </span>
          <span className="mt-2 text-[13px] font-medium text-fg transition-colors group-hover:text-fg-brand">{name}</span>
          <span className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-fg-tertiary">{role}</span>
        </Link>
      </Tooltip>
    </li>
  );
}
