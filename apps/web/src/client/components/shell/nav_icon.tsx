import {
  Blocks,
  BookOpen,
  CalendarClock,
  House,
  Inbox,
  Settings,
  Sparkles,
  SquarePen,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import type { NavIcon as NavIconName } from './nav_model';

const ICONS: Record<NavIconName, LucideIcon> = {
  home: House,
  'new-chat': SquarePen,
  inbox: Inbox,
  squads: Users,
  library: BookOpen,
  tools: Blocks,
  workflows: Workflow,
  routines: CalendarClock,
  skills: Sparkles,
  settings: Settings,
};

export function NavIcon({ name }: { name: NavIconName }) {
  const Icon = ICONS[name];
  return <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />;
}
