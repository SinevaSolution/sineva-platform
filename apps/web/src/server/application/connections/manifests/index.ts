import type { ProviderManifest } from '@/server/domain/connections/connector';
import { COMING_SOON } from './coming_soon';
import { GOOGLE_CALENDAR } from './google_calendar';
import { NOTION } from './notion';
import { MIDTRANS, XENDIT } from './payments';

/** Every provider the catalog lists, in display order. The single source of truth for the gateway, the API and skills. */
export const PROVIDER_MANIFESTS: readonly ProviderManifest[] = [
  GOOGLE_CALENDAR,
  NOTION,
  XENDIT,
  MIDTRANS,
  ...COMING_SOON,
];
