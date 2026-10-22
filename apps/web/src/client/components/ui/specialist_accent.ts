// Specialist accent keys, matching `data-product-accent` in globals.css and
// the compro product accents. Accents are decorative only: icon tiles and
// chips, never buttons, links, body text or focus rings.

import { findManifestEntry, type AccentKey } from '@/shared/specialists/manifest';

// The accents that have a color ramp in globals.css today. The manifest's
// `accent_key` enum already reserves the seven wave 2 and 3 keys, but their
// ramps are not vendored yet, so those would render as the brand accent rather
// than as an invented color.
const RENDERED_ACCENTS = ['people', 'finance', 'sales', 'social', 'help', 'insights'] as const satisfies readonly AccentKey[];

// `brand` is Sino herself (the orchestrator has no manifest entry).
export type SpecialistAccent = (typeof RENDERED_ACCENTS)[number] | 'brand';

export function specialistAccent(agentSlug: string): SpecialistAccent {
  const key = findManifestEntry(agentSlug)?.accent_key;
  return RENDERED_ACCENTS.find((accent) => accent === key) ?? 'brand';
}

// Sino wears a different pose per specialist (compro mascot poses, v011).
// One mascot for the whole product: specialists are Sino at different jobs.
export type SinoPose =
  | 'wave'
  | 'whiteboard'
  | 'coins'
  | 'handshake'
  | 'megaphone'
  | 'holding-phone'
  | 'magnifier'
  | 'laptop'
  | 'confused';

const POSE_BY_SLUG: Record<string, SinoPose> = {
  sinopeople: 'whiteboard',
  sinofinance: 'coins',
  sinosales: 'handshake',
  sinosocial: 'megaphone',
  sinohelp: 'holding-phone',
  sinoinsights: 'magnifier',
};

export function specialistPose(agentSlug: string): SinoPose {
  return POSE_BY_SLUG[agentSlug] ?? 'wave';
}
