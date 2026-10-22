import {
  Building2,
  CreditCard,
  Gauge,
  KeyRound,
  Plug,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { SettingsIconName } from './settings_nav_model';

export const SETTINGS_ICONS: Record<SettingsIconName, LucideIcon> = {
  user: UserRound,
  sliders: SlidersHorizontal,
  key: KeyRound,
  building: Building2,
  users: Users,
  gauge: Gauge,
  plug: Plug,
  sparkles: Sparkles,
  'credit-card': CreditCard,
  shield: ShieldCheck,
};
