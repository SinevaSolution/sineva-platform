// Specialist accent keys, matching `data-product-accent` in globals.css and
// the compro product accents. Accents are decorative only: icon tiles and
// chips, never buttons, links, body text or focus rings.

export type SpecialistAccent =
  | 'people'
  | 'finance'
  | 'sales'
  | 'social'
  | 'help'
  | 'insights'
  | 'brand';

const ACCENT_BY_SLUG: Record<string, SpecialistAccent> = {
  sinopeople: 'people',
  sinofinance: 'finance',
  sinosales: 'sales',
  sinosocial: 'social',
  sinohelp: 'help',
  sinoinsights: 'insights',
};

export function specialistAccent(agentSlug: string): SpecialistAccent {
  return ACCENT_BY_SLUG[agentSlug] ?? 'brand';
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
