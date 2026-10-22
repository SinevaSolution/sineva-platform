import { cn } from '@/client/components/ui/cn';
import { SNSpecialistTile } from '@/client/components/ui/sn_specialist_tile';
import type { ShellSpecialistView } from '@/shared/shell_view';

/**
 * The members of a squad as small accent tiles with their names. The accent
 * stays on the tile; the name carries the meaning (FR-UX-14, FR-SQD-08).
 */
export function SquadMemberTiles({
  slugs,
  specialists,
  leadSlug,
  size = 'sm',
  showNames = true,
  className,
}: {
  slugs: readonly string[];
  specialists: readonly ShellSpecialistView[];
  leadSlug?: string | null;
  size?: 'xs' | 'sm' | 'md';
  showNames?: boolean;
  className?: string;
}) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-3 gap-y-1.5', className)}>
      {slugs.map((slug) => {
        const name = specialists.find((s) => s.agent_slug === slug)?.display_name ?? slug;
        return (
          <li key={slug} className="inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary">
            <SNSpecialistTile agentSlug={slug} name={name} size={size} />
            <span className={cn(!showNames && 'sr-only', leadSlug === slug && 'text-text')}>{name}</span>
          </li>
        );
      })}
    </ul>
  );
}
